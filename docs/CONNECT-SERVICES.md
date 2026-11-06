# Kết nối tài khoản để đưa web lên mạng

Bản local đã chạy. Đưa lên mạng cần quyền ghi GitHub, tài khoản Vercel/Render và database cloud. Không nhập mật khẩu MySQL hay Gemini key vào chat để làm các bước này.

## Bước 1 — Đăng nhập đúng tài khoản GitHub

1. Mở https://github.com và kiểm tra ảnh đại diện góc phải.
2. Đăng nhập tài khoản có quyền ghi vào https://github.com/nhungguyenlehong-hub/quanlytienganh.
3. Git trên Windows có thể dùng một tài khoản khác với trình duyệt. Lần push trước bị 403 vì tài khoản Git không có quyền ghi.
4. Mở File Explorer tại `D:\git\quanlytienganh`, nhấp chuột phải vùng trống và chọn **Open in Terminal**.
5. Nếu bạn dùng chính tài khoản `nhungguyenlehong-hub`, chạy:

```powershell
git credential-manager github login --browser --username nhungguyenlehong-hub
```

6. Trình duyệt mở trang đăng nhập/xác nhận của GitHub. Bạn tự đăng nhập, kiểm tra tài khoản và hoàn tất xác thực. Không copy token vào cửa sổ chat.
7. Quay về terminal rồi chạy:

```powershell
git -c credential.username=nhungguyenlehong-hub push -u origin main
```

Lệnh `-c` chỉ chọn tài khoản cho lần push này, không xóa tài khoản Git khác đang lưu trên máy. Nếu bạn dùng tài khoản khác được mời cộng tác vào repo, thay username bằng tài khoản đó. Nếu vẫn 403, cần chủ repo cấp quyền ghi; đăng nhập thành công chưa đồng nghĩa có quyền ghi.

8. Mở lại repo trên GitHub để kiểm tra có `frontend`, `backend`, `render.yaml`, `docs`. File `backend/.env` không được xuất hiện.

Tham khảo: [GitHub hướng dẫn đăng nhập Git trên Windows](https://docs.github.com/en/get-started/git-basics/caching-your-github-credentials-in-git).

## Bước 2 — Kết nối Vercel với Codex

1. Mở mục **Plugins** trong Codex/ChatGPT desktop, hoặc mở https://chatgpt.com/plugins.
2. Tìm **Vercel**, mở chi tiết plugin.
3. Nhấn nút thêm/cài đặt. Nếu có nút **Connect**, chọn kết nối và đăng nhập tài khoản Vercel của bạn.
4. Xem quyền được yêu cầu và chọn team/workspace chứa dự án. Chưa cần mua domain hay tạo dịch vụ trả phí ở bước kết nối.

## Bước 3 — Kết nối Render

1. Trong cùng thư viện Plugins, tìm **Render**.
2. Cài đặt và kết nối tài khoản Render khi được yêu cầu.
3. Chọn workspace muốn chứa backend và MySQL. Bước này chưa tạo tài nguyên từ `render.yaml`.
4. Quay lại chat dự án và báo **đã kết nối GitHub, Vercel và Render**. Nếu ứng dụng yêu cầu mở chat mới để nạp plugin, chọn lại thư mục dự án và đưa đường dẫn hướng dẫn này để tiếp tục.

Tham khảo: [Hướng dẫn cài và kết nối plugin](https://learn.chatgpt.com/docs/plugins).

## Bước 4 — Triển khai

Sau khi có quyền truy cập, làm theo [DEPLOYMENT.md](DEPLOYMENT.md):

1. MySQL cloud và backend Docker trên Render.
2. Frontend trên Vercel, root directory là `frontend`.
3. Đặt biến môi trường và kiểm tra health/đăng nhập/đọc/dịch.
4. Xem tổng chi phí Render trước khi xác nhận tạo tài nguyên: Blueprint hiện có backend luôn chạy, MySQL private và disk 10 GB, đều chưa được cấp phát.

Database trên Windows chỉ dùng local. Không dùng `localhost` của Windows làm địa chỉ MySQL cho backend trên Render.

## Lịch lấy báo hiện tại

App dùng bộ hẹn giờ **bên trong backend**, chưa có cron bên ngoài để đánh thức dịch vụ:

- Lấy tin khi backend khởi động.
- Lấy tin lúc **09:00 hằng ngày theo giờ Việt Nam** nếu backend đang chạy.
- Nút Cập nhật tin xếp một lượt lấy tin vào nền.
- Mở trang đọc chỉ lấy dữ liệu trong MySQL.
- Sau lượt nhập tin, dọn bài có ngày đăng quá 7 ngày cùng ảnh/bản dịch; giữ từ vựng cá nhân.

Render Free ngủ sau thời gian không có traffic nên không bảo đảm lịch hẹn trong tiến trình. Blueprint hiện chuẩn bị backend luôn chạy; nếu muốn gói có chế độ ngủ, cần thiết kế thêm cron bên ngoài có xác thực để gọi job. Chưa có cron như vậy được tạo trong tài khoản của bạn.

Tham khảo: [Giới hạn Render Free](https://render.com/docs/free).
