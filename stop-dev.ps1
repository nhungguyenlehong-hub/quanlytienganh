param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$stateFile = Join-Path $projectRoot '.local\processes.json'
if (!(Test-Path -LiteralPath $stateFile)) {
    if (!$Quiet) { Write-Host 'No launcher-managed processes to stop. MySQL is left running.' }
    return
}
$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
if ($state.version -ne 2 -or $state.root -ne $projectRoot) {
    throw 'Old or unrecognized process registry. Refusing to stop unverifiable processes. Close the old app processes manually, then remove .local\processes.json and use START-APP.cmd.'
}
function Get-VerifiedRoot($entry) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$entry.pid)"
    if (!$process) { return $null }
    $created = $process.CreationDate.ToUniversalTime().ToString('o')
    if ($created -ne $entry.createdUtc -or $process.Name -ne 'node.exe' -or !$process.CommandLine -or
        $process.CommandLine.IndexOf($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
        $process.CommandLine.IndexOf($entry.entryPoint, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
        $process.ExecutablePath -ne $entry.executable) {
        throw "Process identity mismatch for $($entry.service), PID $($entry.pid). Nothing with this PID will be stopped."
    }
    return $process
}
$targets = @()
foreach ($entry in @($state.processes)) {
    $root = Get-VerifiedRoot $entry
    if (!$root) { continue }
    $all = @(Get-CimInstance Win32_Process)
    $tree = @($root)
    $queue = @([int]$root.ProcessId)
    while ($queue.Count) {
        $next = @()
        foreach ($parentId in $queue) {
            foreach ($child in @($all | Where-Object { $_.ParentProcessId -eq $parentId })) {
                # Windows creates a console host for hidden Node processes. Leave that
                # OS-owned helper alone; Windows closes it when its parent exits.
                if ($child.Name -eq 'conhost.exe' -and $child.ExecutablePath -eq (Join-Path $env:SystemRoot 'System32\conhost.exe')) { continue }
                if (@('node.exe','esbuild.exe') -notcontains $child.Name -or !$child.CommandLine -or
                    $child.CommandLine.IndexOf($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase) -lt 0) {
                    throw "Unrecognized child process $($child.ProcessId). Refusing to stop this process tree."
                }
                $tree += $child
                $next += [int]$child.ProcessId
            }
        }
        $queue = $next
    }
    # Stop the watcher first so it cannot respawn children while they are being stopped.
    $targets += $tree
}
# Check every identity before stopping anything. Recheck creation time immediately before each stop.
foreach ($target in $targets) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$target.ProcessId)"
    if (!$current) { continue }
    if ($current.CreationDate -ne $target.CreationDate -or $current.CommandLine -ne $target.CommandLine) {
        throw "PID $($target.ProcessId) changed identity. Refusing to stop it."
    }
    Stop-Process -Id ([int]$target.ProcessId) -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $stateFile -Force
if (!$Quiet) { Write-Host 'Stopped launcher-managed frontend and backend. MySQL is left running.' }
