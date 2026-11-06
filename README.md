# LingoPress

Ứng dụng đọc báo BBC để học tiếng Anh: Next.js frontend, Express + TypeScript backend, MySQL, Google OAuth và Gemini. Màu chủ đạo xanh ngọc đậm, thiết kế dạng báo điện tử responsive.

**Bắt đầu trên Windows:** [hướng dẫn từng bước](docs/WINDOWS.md). **Đưa lên mạng:** [Vercel + Render + MySQL](docs/DEPLOYMENT.md). **Tổ chức code:** [Vertical slice](docs/ARCHITECTURE.md).

**Nguồn đọc và cách học hằng ngày:** [BBC và gợi ý chọn bài](docs/READING-SOURCES.md).

## Chạy local

Yêu cầu Node.js 22+ và pnpm. MySQL 8 được hỗ trợ; tạo database trước khi cấu hình kết nối.

```powershell
cd D:\git\quanlytienganh
.\start-dev.ps1 -Install
```

Script chạy hai process ẩn; log trong `.local/`, PID trong `.local/processes.json`. Chỉ chạy một lần, tránh trùng cổng.

Hoặc mở hai terminal:

```powershell
cd frontend
pnpm install
pnpm dev
```

```powershell
cd backend
pnpm install
pnpm dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:4000/api/health
- Frontend proxy `/api/*` tới backend bằng `API_INTERNAL_URL` (mặc định `http://localhost:4000`). Không đưa API key vào frontend.

## Cấu hình riêng tư

Điền `backend/.env` từ `backend/.env.example`; các file `.env` được gitignore.

### MySQL

```sql
CREATE DATABASE lingopress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lingopress'@'localhost' IDENTIFIED BY 'YOUR_LOCAL_PASSWORD';
GRANT ALL PRIVILEGES ON lingopress.* TO 'lingopress'@'localhost';
```

Đặt `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` tương ứng. Backend tự tạo các bảng dữ liệu. Kiểm tra `database: connected` ở `/api/health`. Bài báo, ảnh và bản dịch bắt buộc lưu MySQL; khi DB chưa kết nối, API tin tức trả lỗi 503 rõ ràng, không chuyển ngầm sang file cache. Từ vựng/phiên đăng nhập đang dùng lớp lưu trữ riêng `app_store`.

### Google đăng nhập

Tạo OAuth client loại Web application trong Google Cloud, cấu hình consent screen/test users khi cần, thêm redirect URI:

```text
http://localhost:4000/api/auth/google/callback
```

Điền `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`. Phiên đăng nhập dùng token ngẫu nhiên và chỉ lưu hash phía backend. Không thể đăng nhập Google thực tế trước khi có OAuth credentials của bạn.

### Gemini

Điền `GOOGLE_API_KEY` (hoặc alias `GEMINI_API_KEY`) trong backend `.env`, rồi khởi động lại backend. Chọn model theo capability bằng `GEMINI_TEXT_MODEL`, `GEMINI_JSON_MODEL`, `GEMINI_STREAM_MODEL`, `GEMINI_AUDIO_MODEL`; thêm các model được phép chọn vào `GEMINI_ALLOWED_MODELS`. Model phải thực sự hỗ trợ capability đó trong tài khoản của bạn.

`GEMINI_TRANSLATION_MODEL=gemini-3.5-flash-lite` dùng riêng cho dịch báo. Mỗi lần dịch một bài chưa có bản dịch hợp lệ gửi **một** request chứa toàn bài lên Gemini cho mỗi lần thử: đầu vào là JSON array các câu tiếng Anh, đầu ra là JSON array các câu tiếng Việt cùng số lượng/thứ tự. Không chia batch. Nếu Gemini lỗi tạm thời, lỗi mạng hoặc trả kết quả không hợp lệ, backend thử lại tối đa 3 lần sau lần gọi đầu tiên (tối đa 4 request), chờ lần lượt 1, 2, 4 giây. Lỗi cấu hình/API key hoặc quyền truy cập báo ngay; lỗi lưu DB không gọi AI lại. Prompt yêu cầu tiếng Việt tự nhiên, thoáng nhưng giữ đúng dữ kiện/tên/số liệu, không tự thêm thông tin.

Backend ghép bản dịch theo ID câu để reader hiển thị song ngữ. JSON nguồn và kết quả lưu trong bảng `article_translations`, liên kết với bài báo; cache dựa vào nội dung, model và phiên bản prompt. Bản dịch thiếu/thừa/rỗng không được lưu là hoàn tất. Mở lại bài đã dịch không gọi Gemini lại. Nếu toàn bài vượt giới hạn, trả lỗi thay vì cắt bớt nội dung hoặc chia thành nhiều request. Không có key thì vẫn đọc bài đã lưu và tra từ được, nhưng dịch sẽ báo chưa cấu hình.

Xem chi tiết adapter, JSON schema, SSE và transcription tại [backend/src/ai/README.md](backend/src/ai/README.md).

## Hành vi nội dung

- Job nền lấy RSS BBC theo danh mục, tải toàn văn và ảnh trước khi lưu. GET danh sách/chi tiết chỉ đọc dữ liệu đã lưu trong MySQL, không cào BBC mỗi lần mở trang.
- Backend chạy job khi khởi động và lúc **09:00 mỗi ngày theo giờ Việt Nam/Bangkok** (02:00 UTC). Có chống chạy trùng trong tiến trình và khóa MySQL giữa các tiến trình. Nút Cập nhật tin xếp job vào nền và giao diện theo dõi trạng thái. Lịch chỉ chạy khi backend đang hoạt động; nếu máy tắt, lượt khởi động tiếp theo sẽ đồng bộ và dọn dữ liệu.
- Sau lượt nhập tin, job xóa bài có ngày đăng cách hiện tại quá 7 ngày. Ngày đăng được chuẩn hóa UTC; bài quá hạn trong RSS không được nhập lại. Ảnh và bản dịch liên quan xóa theo bài. Từ vựng cá nhân cùng câu ngữ cảnh được giữ lại.
- Không dựng bài giả khi BBC lỗi. Bài có hạn chế truy cập, liveblog, multimedia hoặc cấu trúc chưa hỗ trợ có thể chỉ có tóm tắt. Ứng dụng báo trạng thái đó; không đảm bảo mọi loại bài BBC đều trích xuất đầy đủ.
- Ảnh tải từ BBC trong job và lưu nhị phân BLOB trong MySQL, kèm MIME type, kích thước và URL nguồn. Frontend hiển thị bằng endpoint `/api/images/:id`, không hotlink BBC và chưa cần R2. Chỉ nhận định dạng ảnh được hỗ trợ, giới hạn kích thước; ảnh lỗi được ghi trạng thái. Ảnh trong reader có thể được trình bày lại thành thư viện thay vì đúng vị trí của trang gốc.
- Từ điển hiện dùng Free Dictionary API, định nghĩa Anh–Anh; chưa phải từ điển Anh–Việt đầy đủ. Từ được lưu kèm ngữ cảnh bài đọc. Chưa đăng nhập thì frontend lưu trên thiết bị và ghi rõ chế độ này.

## API chính

| Endpoint | Chức năng |
| --- | --- |
| `GET /api/health` | Trạng thái backend và MySQL |
| `GET /api/categories` | Danh mục RSS BBC |
| `GET /api/articles?category=world&q=&page=1` | Danh sách bài |
| `GET /api/articles/:id` | Toàn văn, ảnh, danh sách câu |
| `POST /api/feeds/refresh` | Xếp job nhập tin vào nền (202) |
| `GET /api/jobs/news` | Theo dõi job nhập tin/dọn dữ liệu |
| `GET /api/images/:id` | Đọc ảnh BLOB từ MySQL |
| `GET /api/dictionary?word=example` | Tra từ |
| `GET /api/auth/me` | Phiên đăng nhập và trạng thái cấu hình |
| `GET /api/auth/google` | Bắt đầu Google OAuth |
| `POST /api/auth/logout` | Đăng xuất |
| `GET / POST /api/words` | Từ đã lưu của tài khoản |
| `DELETE /api/words/:id` | Xóa từ |
| `GET /api/ai/status` | Trạng thái và các model cấu hình |
| `POST /api/ai/translation-jobs` | Tạo/tiếp tục job dịch, trả nhanh HTTP 202 |
| `GET /api/ai/translation-jobs/:id` | Lấy trạng thái, kết quả đã lưu hoặc lỗi của job |
| `POST /api/ai/translate` | Dịch toàn bộ bài theo câu |
| `POST /api/ai/text` | Text generation (đăng nhập) |
| `POST /api/ai/json` | Structured JSON (đăng nhập) |
| `POST /api/ai/stream` | SSE streaming (đăng nhập) |
| `POST /api/ai/transcribe` | Audio base64 → transcript (đăng nhập) |

## Kiểm tra

```powershell
cd backend
pnpm test
pnpm build
cd ../frontend
pnpm typecheck
pnpm build
```

## Backend container

Không cần Docker để debug local. Khi muốn chạy container:

```powershell
docker build -t lingopress-api ./backend
docker run --rm -p 4000:4000 --env-file backend/.env -e MYSQL_HOST=host.docker.internal -v lingopress-data:/app/.data lingopress-api
```

Dừng backend Node trước để tránh trùng cổng 4000. Trong Docker Desktop, `host.docker.internal` trỏ về MySQL trên Windows; tài khoản MySQL cần cho phép kết nối từ container. Trên Render cấu hình MySQL host thực tế và secret trên dashboard. MySQL cần backup độc lập. Volume `.data` ở ví dụ chỉ dành cho lớp tương thích phiên đăng nhập/từ vựng cũ, không phải nơi lưu bài báo, ảnh hoặc bản dịch mới.
