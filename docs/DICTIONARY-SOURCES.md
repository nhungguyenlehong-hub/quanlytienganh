# Nguồn từ điển Anh–Việt

## Nguồn đang tích hợp

### 1. dict.minhqnd.com — API công khai miễn phí

- Tài liệu và nguồn dữ liệu: https://dict.minhqnd.com/
- Endpoint: `https://dict.minhqnd.com/api/v1/lookup?word=book&lang=en&def_lang=vi`
- Đã kiểm tra thực tế với `book`, `reading`, `business`, `run`, `storage`: có nghĩa tiếng Việt, từ loại và phiên âm; ví dụ tùy từ.
- API không yêu cầu key trong các lần kiểm tra. Không tìm thấy cam kết SLA/hạn mức cố định trong tài liệu đã đọc; app không giả định dịch vụ luôn sẵn sàng hoặc không giới hạn.
- Nhà cung cấp tổng hợp nhiều bộ dữ liệu; giấy phép và nguồn gốc khác nhau. API công bố CC BY-SA 4.0 cho dịch vụ/dữ liệu của họ và liệt kê các nguồn gốc riêng như Wiktionary, FVDP/GPL. Kết quả cần giữ thông tin nguồn, link tài liệu và giấy phép tương ứng.
- Một số ví dụ có thể được nhà cung cấp bổ sung bằng AI; không xem mọi ví dụ là trích dẫn từ ngữ liệu đã biên tập.

### 2. Wiktionary tiếng Việt — API MediaWiki chính thức

- Mục từ ví dụ: https://vi.wiktionary.org/wiki/book
- API: `https://vi.wiktionary.org/w/api.php?action=parse&page=book&prop=text&format=json&formatversion=2`
- Tài liệu parse: https://www.mediawiki.org/wiki/API:Parsing_wikitext
- Backend chỉ lấy phần **Tiếng Anh** trong mục từ và trả các định nghĩa dưới dạng văn bản, không đưa HTML từ website vào giao diện.
- Có nguồn tiếng Việt khi mục từ đã được cộng đồng biên soạn; độ phủ, chất lượng và độ đầy đủ thay đổi theo từ. Giữ link mục từ và thông tin giấy phép của nguồn.

### 3. Free Dictionary API — nguồn Anh–Anh dự phòng

- https://dictionaryapi.dev/
- Chỉ dùng khi chưa có nghĩa tiếng Việt từ hai nguồn trên. Giao diện ghi rõ **Anh–Anh**, không trình bày nghĩa tiếng Anh như bản dịch tiếng Việt.

## Hướng tự chủ dữ liệu về sau

Kaikki/Wiktextract có dữ liệu JSON trích xuất từ Wiktionary để xây từ điển local:

- Danh mục: https://kaikki.org/
- Phải chọn **Vietnamese Wiktionary edition / mục từ Tiếng Anh**, ví dụ https://kaikki.org/viwiktionary/Ti%E1%BA%BFng%20Anh/meaning/E/En/English.html
- Không nhầm với `kaikki.org/dictionary/Vietnamese/`: đó là các từ tiếng Việt lấy từ bản Wiktionary tiếng Anh, phần giải nghĩa thường bằng tiếng Anh.

LingoPress chưa tải toàn bộ bộ dữ liệu này. Hiện backend tra API, chuẩn hóa kết quả và cache; không sao chép kho của Laban/Cambridge hoặc gọi các endpoint nội bộ chưa được công bố để xây dữ liệu.

## Luồng người dùng

1. Bấm từ tiếng Anh trong bài báo hoặc chọn một cụm từ.
2. Bảng từ điển hiển thị nghĩa, phiên âm, từ loại, ví dụ và nguồn.
3. Chọn nghĩa phù hợp với câu đang đọc rồi lưu từ kèm nghĩa đó và câu ngữ cảnh.
4. Từ đã lưu không mất khi bài báo bị dọn sau 7 ngày.

Tra từ không dùng Gemini. API key Gemini chỉ phục vụ dịch bài và các chức năng AI khác.
