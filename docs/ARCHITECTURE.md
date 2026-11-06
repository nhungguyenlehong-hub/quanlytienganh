# Vertical slice trong LingoPress

Mỗi thư mục tính năng chứa luồng nghiệp vụ của chính nó: nhận yêu cầu, xử lý, lưu/đọc dữ liệu và giao diện nếu ở frontend. Thêm tính năng mới bằng một slice mới thay vì dồn mọi chức năng vào một controller/service chung.

```text
backend/src/
  features/
    reading/       # Danh mục, RSS, toàn văn, ảnh BLOB, nhập tin/dọn bài
    translation/   # Dịch theo câu, cache, job và trạng thái
    vocabulary/    # Từ đã lưu theo người dùng
    dictionary/    # Tra từ bên ngoài
    auth/          # Google OAuth và phiên đăng nhập
  shared/
    db/            # Kết nối và lưu trữ dùng chung
    ai/            # Adapter Gemini, text/JSON/stream/STT
  index.ts         # Khởi động và ghép các router

frontend/
  app/             # Route mỏng: chọn component của tính năng
  features/
    reading/       # Thư viện, reader, trạng thái/polling dịch
    vocabulary/    # Tra từ trong ngữ cảnh và sổ từ
    auth/          # Trạng thái đăng nhập
  components/      # Header/footer dùng chung
  lib/             # HTTP client và kiểu dữ liệu dùng chung
```

Kết nối MySQL, HTTP middleware và AI transport là hạ tầng dùng chung. Các file export ở vị trí cũ có thể còn được giữ để tương thích với test/import; chúng không chứa một bản nghiệp vụ khác.

## Luồng đọc

Job nhập tin lấy RSS theo chủ đề từ BBC, lấy toàn văn/ảnh rồi lưu transaction vào MySQL. API GET chỉ truy vấn DB. Ảnh trả bằng endpoint riêng từ BLOB. Từ đã lưu không bị xóa khi bài báo hết thời hạn 7 ngày.

## Luồng dịch

```text
Bấm Dịch bài báo
  -> POST tạo/tiếp tục job, nhận ID nhanh
  -> backend kiểm tra bản dịch đã lưu
  -> nếu chưa có, gọi Gemini cho toàn bộ mảng câu
  -> validate đủ câu -> lưu MySQL -> job completed
  -> frontend GET trạng thái ngắn định kỳ -> hiển thị song ngữ
```

Mỗi lần thử gửi toàn bài một request, không chia bài ra nhiều batch. Có 1 lần đầu và tối đa 3 lần thử lại khi lỗi tạm thời. Job và cache ở MySQL giúp người đọc tiếp tục lấy kết quả đã lưu. Mở trang không tự bắt đầu dịch mới.

Async job không yêu cầu browser giữ một request mở suốt thời gian AI xử lý. Trạng thái job thất bại được trả về giao diện, không che bằng bài/bản dịch giả.

## Khi mở rộng

- Thêm provider AI bằng adapter, không viết Google SDK trực tiếp trong reader.
- Thêm nguồn báo trong slice reading và cơ chế kiểm tra nguồn/chuẩn hóa học liệu.
- Thay BLOB bằng R2/S3 qua lớp lưu ảnh khi cần; frontend vẫn dùng URL ảnh do backend trả về.
- Khi chạy nhiều worker/instance, kiểm tra queue/claim/retry và rate limit thành hạ tầng chia sẻ; không coi in-memory limiter là queue phân tán.
- Thay cơ chế tự tạo schema bằng migration có phiên bản trước khi có thay đổi schema lớn.
