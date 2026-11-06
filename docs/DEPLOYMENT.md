# Đưa LingoPress lên Vercel + Render

Code đã có cấu hình triển khai; tài nguyên cloud chưa được tạo tự động. Không dùng MySQL `localhost` của máy Windows làm địa chỉ DB trên Render.

## Kiến trúc triển khai

```text
Trình duyệt -> Vercel (frontend Next.js, /api proxy)
                  -> Render (Express Docker, jobs nhập báo/dịch)
                       -> MySQL private service + persistent disk
                       -> Gemini API
```

Ảnh BLOB và dữ liệu bài đọc ở MySQL. Browser chỉ gọi cùng origin `/api`, không cần gửi API key. Dịch là job bất đồng bộ: POST tạo job trả nhanh, GET lấy trạng thái/kết quả, tránh giới hạn thời gian proxy Vercel. Backend phải luôn hoạt động để lịch nhập tin/dọn dữ liệu và các job chạy đúng giờ.

## 1. Đưa mã nguồn lên GitHub

Repository đã cấu hình origin `https://github.com/nhungguyenlehong-hub/quanlytienganh.git`. Chỉ đưa source, lockfiles và config lên Git; không đưa `.env`, `.local`, `.data`, node_modules hay mật khẩu/key vào GitHub.

Nếu chưa có commit, mở terminal tại thư mục dự án, chạy:

```powershell
git status
git add .
git commit -m "Build LingoPress reading MVP"
git push -u origin main
```

Kiểm tra `git status` trước khi commit: `.env` không được xuất hiện trong danh sách file đưa lên.

## 2. Tạo frontend Vercel

1. Đăng nhập Vercel, chọn **Add New > Project**, import repository trên.
2. **Root Directory**: `frontend`.
3. Framework: **Next.js**. Giữ lệnh install/build trong `frontend/vercel.json`.
4. Đặt biến server `API_INTERNAL_URL` là URL HTTPS của backend Render sau khi backend có URL. Không đặt Gemini key ở Vercel.
5. Vercel có thể tạo URL frontend trước khi backend sẵn sàng; trang sẽ báo lỗi kết nối cho tới khi cấu hình backend đúng.

Ví dụ URL frontend: `https://YOUR-PROJECT.vercel.app`. Đây là ví dụ, không phải URL đã deploy.

## 3. Tạo MySQL và backend Render

`render.yaml` ở root khai báo hai service tại Singapore:

- `lingopress-mysql`: MySQL 8, private network, disk 10 GB gắn tại `/var/lib/mysql`.
- `lingopress-api`: Express chạy Docker, kết nối DB qua mạng nội bộ Render.

Blueprint có **hai gói compute trả phí và disk trả phí**. Xem tổng tiền trên màn hình Render trước khi xác nhận tạo tài nguyên; file này không phải yêu cầu tự động thanh toán. Có thể chỉnh gói phù hợp trước khi áp dụng. Chưa cấu hình gói free vì DB cần disk bền vững và job cần backend hoạt động thường xuyên.

1. Đăng nhập Render, chọn **New > Blueprint**, chọn repository.
2. Render đọc `render.yaml`. Kiểm tra vùng và giá các service/disk.
3. Điền các biến yêu cầu:

| Biến ở backend Render | Giá trị |
| --- | --- |
| `FRONTEND_URL` | URL Vercel chính thức, không có dấu `/` ở cuối |
| `GOOGLE_API_KEY` | Gemini API key, nhập riêng trong dashboard |
| `GOOGLE_CLIENT_ID` | OAuth client ID nếu bật Google login |
| `GOOGLE_CLIENT_SECRET` | OAuth secret nếu bật Google login |
| `GOOGLE_CALLBACK_URL` | `https://YOUR-PROJECT.vercel.app/api/auth/google/callback` |

Nếu chưa thiết lập Google OAuth, để ba biến OAuth rỗng và dùng phần đọc/tra từ/dịch trước. Đọc báo không yêu cầu Google login. Key/mật khẩu local không tự đồng bộ lên Render.

Mật khẩu MySQL được Render tự sinh rồi truyền sang backend; không copy mật khẩu `root` local vào cloud. MySQL cần chạy và tạo DB thành công trước khi backend kiểm tra health.

4. Xem log/deploy. Trạng thái backend `/api/health` cần HTTP 200 và `database: connected`.
5. Copy URL backend, ví dụ `https://YOUR-API.onrender.com`.
6. Quay về Vercel, đặt `API_INTERNAL_URL` bằng URL này, rồi **Redeploy** để Next.js build lại rewrite.
7. Mở URL frontend, nhấn Cập nhật tin, chờ job nhập tin xong, mở một bài toàn văn và nhấn Dịch bài báo.

Blueprint để `autoDeployTrigger: off`: commit mới không tự thay đổi môi trường; chủ động deploy sau khi kiểm tra. Có thể bật tự deploy sau khi quy trình đã ổn.

## 4. Google login trên cloud

Trong Google Cloud OAuth client, thêm redirect URI **thuộc frontend Vercel**:

```text
https://YOUR-PROJECT.vercel.app/api/auth/google/callback
```

Callback đi qua rewrite tới Render và cookie phiên được gắn vào domain frontend. Không dùng callback trực tiếp vào domain Render trong mô hình này. Giữ callback localhost riêng nếu vẫn phát triển local.

## 5. Kiểm tra sau deploy

- Frontend mở được, có ảnh từ `/api/images/...` và bài từ MySQL.
- Bấm dịch tạo job; reload trang vẫn tiếp tục được job, kết quả lưu DB.
- Đọc lại bản dịch không gọi Gemini thêm.
- Google login quay về cùng domain Vercel, trạng thái đăng nhập giữ lại.
- Lịch nhập/dọn tin lúc 09:00 Việt Nam; bài quá 7 ngày bị xóa cùng ảnh/bản dịch.
- Dùng `mysqldump` sao lưu MySQL định kỳ; disk không thay thế bản backup database.

## Khi chưa deploy được

Thiếu đăng nhập/kết nối tài khoản Vercel/Render hoặc chưa chọn gói cloud thì chỉ có bản local chạy được. Không thể xác nhận đã publish bằng cách chỉ tạo các file cấu hình.

Nguồn đối chiếu: [Render Blueprint](https://render.com/docs/blueprint-spec), [MySQL trên Render](https://render.com/docs/deploy-mysql), [giới hạn Vercel](https://vercel.com/docs/limits), [Vercel rewrites](https://vercel.com/docs/rewrites).
