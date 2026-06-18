# FF Logo AI Matcher

Web Node.js/Express + HTML/CSS/JS để nhận danh sách team Free Fire, upload logo, dùng AI vision chọn team phù hợp và xuất PNG 500x500 theo HEADPICS ID.

## Chạy local

```powershell
npm install
copy .env.example .env
npm start
```

Mở:

```text
http://localhost:3000
```

Bạn có thể đặt `OPENAI_API_KEY` trong `.env`, hoặc khi chạy local dán key trong phần Cấu hình AI trên web để lưu vào `.env`.

## Cách dùng

1. Dán danh sách team, ví dụ `1 EOP` hoặc `TEAM | AVATAR | HEADPICS_ID`.
2. Bấm `Nhập vào bảng`.
3. Upload nhiều logo.
4. Bấm `AI phân tích logo`.
5. Với logo chưa chắc, chọn team đúng và bấm `Gán & học`.
6. Bấm `Tải ZIP`.

File ZIP chứa:

- `HEADPICS_ID.png`: logo 500x500.
- `mapping.csv`: bảng đối chiếu team, ID, file gốc và kết quả AI.

## Biến môi trường

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
PORT=3000
MAX_TEAMS=300
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` chỉ được dùng ở backend và không bao giờ được đưa vào mã frontend hoặc commit lên Git.

## CI/CD Azure App Service

Workflow `.github/workflows/azure-app-service.yml` kiểm tra mã trên pull request và tự deploy khi push vào nhánh `main`.

Trong GitHub repo, vào **Settings > Secrets and variables > Actions**:

- Tạo variable `AZURE_WEBAPP_NAME` bằng đúng tên Azure App Service.
- Tạo secret `AZURE_WEBAPP_PUBLISH_PROFILE` bằng nội dung file Publish Profile tải từ Azure Portal.

Trong Azure Portal, vào **App Service > Settings > Environment variables** và thêm:

```env
NODE_ENV=production
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=
```

Azure tự cấp biến `PORT`; không cần đặt cứng `PORT=3000` trên App Service. Sau khi lưu App Settings, push lên `main` sẽ kích hoạt deploy tự động.

## Deploy Render

Tạo Web Service từ repo này:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Environment:
  - `OPENAI_API_KEY`: API key của bạn
  - `OPENAI_MODEL`: `gpt-4o-mini` hoặc model vision tương thích
  - `NODE_ENV`: `production`

Repo có sẵn `render.yaml` nếu muốn dùng Blueprint.

## Deploy Vercel

Repo có sẵn `vercel.json`. Import repo GitHub vào Vercel, rồi đặt Environment Variables:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
NODE_ENV=production
```

Vercel sẽ dùng `server.js` làm Express serverless app. Không đặt API key trong source code hoặc `.env` khi upload GitHub.
# ff-logo
