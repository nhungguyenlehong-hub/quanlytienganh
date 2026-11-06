# Mở LingoPress trên Windows

## Mở ứng dụng mỗi ngày

1. Mở File Explorer và vào `D:\git\quanlytienganh`.
2. Nhấp đúp **START-APP.cmd**.
3. Đợi thông báo `LingoPress is ready`. Trình duyệt sẽ tự mở tại **http://localhost:3000**.
4. Chọn danh mục, mở bài báo rồi chọn **Dịch bài báo** để đọc song ngữ.

Không cần mở hai terminal, cài npm toàn máy hay nhớ lệnh chạy Next.js/Express. Launcher ưu tiên Node có sẵn, sau đó tìm runtime Node đi kèm Codex trên máy này. Các tiến trình frontend/backend chạy nền; có thể đóng cửa sổ thông báo sau khi ứng dụng sẵn sàng. Nhấp START lần nữa sẽ dùng lại tiến trình do launcher quản lý.

## Điều kiện cần có

- MySQL trên máy phải đang chạy. Nhấn `Windows + R`, nhập `services.msc`, tìm **MySQL80** và kiểm tra trạng thái **Running**. Nếu dịch vụ không tồn tại, dùng tên dịch vụ MySQL bạn đã cài. Không cần đổi mật khẩu hay cấu hình dịch vụ để sử dụng launcher.
- Thông tin kết nối MySQL và Google API key được cấu hình trong `backend\.env`. Không gửi file này qua chat, commit Git hoặc đưa key vào frontend.
- Internet để nhận bài BBC và dịch bằng Gemini. Bài/bản dịch đã lưu được đọc từ MySQL.
- Nếu chuyển sang máy khác không có runtime Codex, cài Node.js LTS 22 trở lên kèm npm trước khi chạy launcher.

## Khởi động lại và dừng

| Thao tác | File cần nhấp đúp |
| --- | --- |
| Mở app | `START-APP.cmd` |
| Khởi động lại sau khi sửa `.env` hoặc cập nhật code | `RESTART-APP.cmd` |
| Dừng frontend và backend | `STOP-APP.cmd` |

STOP chỉ dừng cây tiến trình mà launcher xác minh thuộc dự án này. **MySQL vẫn chạy.** Đóng tab trình duyệt không dừng ứng dụng; dùng STOP khi muốn giải phóng bộ nhớ và cổng 3000/4000.

Các file `.cmd` sử dụng `ExecutionPolicy Bypass` chỉ cho lần chạy PowerShell hiện tại; không thay đổi thiết lập thực thi script của Windows.

## Nếu có lỗi

- **Không tìm thấy Node:** trên máy này launcher tìm runtime Codex tự động. Trên máy khác, cài Node.js LTS và chạy lại START.
- **Thiếu dependencies:** launcher tự cài khi thiếu executable cần thiết. Nếu vừa thay package/dependencies, mở PowerShell tại thư mục dự án và chạy `./start-dev.ps1 -Restart -Install`.
- **Cổng 3000 hoặc 4000 đang được dùng:** dùng STOP nếu app được mở bằng launcher này. Với phiên bản chạy thủ công trước đó, đóng terminal/tiến trình phiên bản cũ. Launcher không tự giết tiến trình lạ.
- **Old process registry:** các lần chạy cũ chỉ lưu PID nên không thể xác minh an toàn. Đóng phiên bản cũ thủ công, xóa riêng file `.local\processes.json`, rồi START lại. Không xóa file registry khi phiên bản mới đang chạy.
- **MySQL chưa kết nối:** kiểm tra dịch vụ MySQL đang chạy và thông tin trong `backend\.env`, sau đó RESTART. Launcher không tự đổi mật khẩu database.
- **Dịch báo lỗi API hoặc hạn mức:** kiểm tra key/cấu hình Gemini trong `backend\.env`, sau đó RESTART. Không đưa API key vào URL trình duyệt.
- **App chờ quá 120 giây:** xem log dưới đây. Tiến trình đã chạy vẫn được lưu để STOP hoặc RESTART an toàn.

Mở thư mục `.local` trong dự án để xem:

- `backend.log` và `backend.error.log`: API, MySQL, nhận báo và dịch.
- `frontend.log` và `frontend.error.log`: Next.js và giao diện.

Khi cần hỗ trợ, gửi đoạn lỗi liên quan sau khi kiểm tra và che mọi thông tin nhạy cảm. Không gửi `backend\.env`.

## Lệnh tùy chọn

Trong PowerShell tại thư mục dự án:

```powershell
./start-dev.ps1 -NoBrowser
./start-dev.ps1 -Restart -NoBrowser
./stop-dev.ps1
```

`-NoBrowser` phù hợp khi chỉ cần khởi động dịch vụ và đã có tab trình duyệt mở.
