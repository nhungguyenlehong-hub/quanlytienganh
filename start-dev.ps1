param([switch]$Install, [switch]$Restart, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$logPath = Join-Path $projectRoot '.local'
$stateFile = Join-Path $logPath 'processes.json'
New-Item -ItemType Directory -Path $logPath -Force | Out-Null

function Find-Node {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($candidate in @(
        (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'),
        (Join-Path $env:ProgramFiles 'nodejs\node.exe')
    )) { if (Test-Path -LiteralPath $candidate) { return $candidate } }
    throw 'Node.js was not found. Install Node.js 22 LTS, reopen this launcher, or use the bundled Codex runtime.'
}
$nodePath = Find-Node
$env:PATH = (Split-Path $nodePath) + ';' + $env:PATH
if ($Restart) { & (Join-Path $projectRoot 'stop-dev.ps1') -Quiet }

function Install-Dependencies($servicePath) {
    $runner = $null; $prefix = @()
    $bundled = Join-Path (Split-Path (Split-Path $nodePath)) 'node_modules\pnpm\bin\pnpm.cjs'
    if (Test-Path -LiteralPath $bundled) { $runner = $nodePath; $prefix = @($bundled) }
    if (!$runner) {
        foreach ($name in @('pnpm.cmd','npm.cmd')) {
            $command = Get-Command $name -ErrorAction SilentlyContinue
            if ($command) { $runner = $command.Source; break }
        }
    }
    if (!$runner) { throw 'Dependencies are missing, but pnpm/npm was not found. Install Node.js LTS with npm and try START-APP.cmd again.' }
    Push-Location $servicePath
    try {
        Write-Host "Installing dependencies in $servicePath ..."
        & $runner @prefix install
        if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed in $servicePath. Check the messages above." }
    } finally { Pop-Location }
}

$services = @(
    [pscustomobject]@{name='backend';folder='backend';entry='node_modules\tsx\dist\cli.mjs';arguments=@('watch',(Join-Path $projectRoot 'backend\src\index.ts'));port=4000;url='http://127.0.0.1:4000/api/health'},
    [pscustomobject]@{name='frontend';folder='frontend';entry='node_modules\next\dist\bin\next';arguments=@('dev','--hostname','0.0.0.0','--port','3000');port=3000;url='http://127.0.0.1:3000'}
)
$tracked = @()
if (Test-Path -LiteralPath $stateFile) {
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if ($state.version -ne 2 -or $state.root -ne $projectRoot) {
        throw 'Old process registry detected. Close the previous app processes manually and remove .local\processes.json before using this launcher. No processes have been stopped.'
    }
    foreach ($entry in @($state.processes)) {
        $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$entry.pid)"
        if (!$existing) { continue }
        if ($existing.CreationDate.ToUniversalTime().ToString('o') -ne $entry.createdUtc -or $existing.Name -ne 'node.exe' -or
            !$existing.CommandLine -or $existing.CommandLine.IndexOf($entry.entryPoint,[StringComparison]::OrdinalIgnoreCase) -lt 0 -or
            $existing.CommandLine.IndexOf($projectRoot + '\',[StringComparison]::OrdinalIgnoreCase) -lt 0 -or
            $existing.ExecutablePath -ne $entry.executable) {
            throw "Saved PID $($entry.pid) no longer belongs to this app. Refusing to reuse it."
        }
        $tracked += $entry
    }
}
function Save-State {
    $value = [pscustomobject]@{version=2;root=$projectRoot;processes=@($script:tracked)}
    $temporary = $stateFile + '.tmp'
    $value | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $stateFile -Force
}
foreach ($service in $services) {
    if (@($tracked | Where-Object {$_.service -eq $service.name}).Count) {
        Write-Host "$($service.name) is already running."
        continue
    }
    $servicePath = Join-Path $projectRoot $service.folder
    $entryPoint = Join-Path $servicePath $service.entry
    if ($Install -or !(Test-Path -LiteralPath $entryPoint)) { Install-Dependencies $servicePath }
    if (!(Test-Path -LiteralPath $entryPoint)) { throw "Missing executable: $entryPoint" }
    $listener = Get-NetTCPConnection -State Listen -LocalPort $service.port -ErrorAction SilentlyContinue
    if ($listener) { throw "Port $($service.port) is already used by an untracked process. Close the previous app instance manually. This launcher will not stop unrelated processes." }
    $arguments = @('"' + $entryPoint + '"') + @($service.arguments | ForEach-Object { '"' + $_ + '"' })
    $process = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $servicePath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath "$($service.name).log") -RedirectStandardError (Join-Path $logPath "$($service.name).error.log")
    $identity = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
    if (!$identity) { throw "$($service.name) exited immediately. Check .local\$($service.name).error.log." }
    $tracked += [pscustomobject]@{service=$service.name;pid=$process.Id;createdUtc=$identity.CreationDate.ToUniversalTime().ToString('o');entryPoint=$entryPoint;executable=$identity.ExecutablePath}
    Save-State
    Write-Host "Started $($service.name)."
}
Write-Host 'Waiting for the app to become ready ...'
$deadline = (Get-Date).AddSeconds(120)
$ready = $false
while ((Get-Date) -lt $deadline) {
    $ready = $true
    foreach ($service in $services) {
        try { $response = Invoke-WebRequest -Uri $service.url -UseBasicParsing -TimeoutSec 5; if ($response.StatusCode -ne 200) { $ready = $false } }
        catch { $ready = $false }
    }
    if ($ready) { break }
    foreach ($entry in $tracked) {
        if (!(Get-Process -Id $entry.pid -ErrorAction SilentlyContinue)) { throw "$($entry.service) stopped unexpectedly. Check .local\$($entry.service).error.log." }
    }
    Start-Sleep -Seconds 1
}
if (!$ready) { throw 'The app did not become ready within 120 seconds. Processes remain tracked. Check .local logs, then use RESTART-APP.cmd.' }
Write-Host ''
Write-Host 'LingoPress is ready: http://localhost:3000' -ForegroundColor Green
Write-Host 'Logs: .local\frontend.log and .local\backend.log (and *.error.log)'
Write-Host 'Use RESTART-APP.cmd after changing backend\.env. Use STOP-APP.cmd to stop the app.'
if (!$NoBrowser) { Start-Process 'http://localhost:3000' }
