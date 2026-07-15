# 教大签证查询中心

帮助香港教育大学学生读取入境处申请档案编号（`immdRefNo`）并用简体中文展示的开源项目。

- 网站版：<https://eduhkvisa.cust.edu.kg>
- 本机插件版：仓库根目录中的 Chrome／Edge 扩展

> 本项目不是香港教育大学或香港入境事务处的官方产品。所有资料及电子签证签发情况以官方网站为准。

## MEEN 编号是什么？

教大签证系统返回的 `immdRefNo`（例如 `MEEN-XXXXXXX-XX`）是香港入境处的**申请档案编号**。电子签证签发后，通常需要以下资料下载：

- MEEN 开头的申请档案编号
- 申请人的出生日期
- 申请时登记的旅行证件号码首四位

找到 MEEN 编号不代表签证已经签发。申请获批并完成缴费（如适用）后，才可在入境处网站下载。

- [香港政府：下载电子签证](https://www.gov.hk/tc/residents/immigration/nonpermanent/downloadevisa.htm)
- [香港政府：申请档案编号说明](https://www.gov.hk/tc/residents/immigration/nonpermanent/apprefnumber.htm)

## 小白用户：直接使用网站

网站版不需要安装插件。

1. 打开 <https://eduhkvisa.cust.edu.kg>。
2. 注册签证中心账号。这里设置的是**本站密码**，不是教大密码。
3. 登录后填写教大签证系统要求的资料：
   - 教大申请编号
   - 身份证明类型和完整号码
   - 出生日期
   - 入学学期
4. 勾选隐私提示，点击“安全登录并查询”。
5. 查询成功后，网页会突出显示 MEEN 开头的申请档案编号，并引导前往香港入境处官网。

### 网站版如何工作

```text
学生提交教大登录资料
        ↓ HTTPS
本站服务器建立一次性教大会话
        ↓
调用教大官方登录接口及本人资料接口
        ↓
只保留页面所需的白名单字段
        ↓
结果直接返回当前网页
        ↓
函数结束，官网 Cookie 和登录字段被丢弃
```

服务端不会把教大登录字段、官网 Cookie 或签证查询结果写入 PostgreSQL、文件或应用日志。它们会在一次 HTTPS 请求期间经过服务器内存，因此请只在你信任的网站域名上使用。

每次查询使用独立的局部 Cookie 容器，不共享全局登录状态，支持多个学生同时查询。

## 更注重隐私：使用本机插件

插件版保留不变。它在学生自己的浏览器中调用教大接口，教大登录资料和查询结果都不经过本站服务器，也不需要注册网站账号。

### 下载和安装

1. 在 GitHub 仓库页面点击绿色 **Code**。
2. 点击 **Download ZIP**。
3. 下载后右键 ZIP，选择“全部解压”。不要直接在压缩包里运行。
4. Windows 用户可双击 `启动签证助手.cmd`，按中文提示操作。

也可以手动安装：

1. Chrome 地址栏打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择解压后的整个 `eduhkvisa` 文件夹。
5. 把“教大签证进度助手”固定到浏览器工具栏。

### 插件查询步骤

1. 使用同一个浏览器打开[教大申请系统](https://pappl.eduhk.hk/VMS/admission/applicant/ImmD/submission)。
2. 在教大官网正常登录并保持页面开启。
3. 点击工具栏中的“教大签证进度助手”。
4. 点击“查询我的签证资料”。

## 隐私说明

网站服务器会保存：

- 签证中心账号邮箱
- 带随机盐的 scrypt 密码哈希（不保存本站明文密码）
- 网站登录 session

网站服务器不会持久保存：

- 教大申请编号、身份证明号码和出生日期
- 教大登录 Cookie 或 XSRF token
- MEEN 编号和其他签证查询结果
- 上传文件链接、文件清单或当前申请状态

实现上的保护：

- 查询接口只接受本站已登录用户的同源请求。
- 每个查询创建独立 Cookie 容器，函数结束后不再引用。
- 对查询频率进行限制，防止接口被滥用。
- 返回前使用字段白名单，明确排除 `status`、`uploadedDocuments` 和 `requiredDocuments`。
- 生产环境强制 HTTPS；网站 Cookie 使用 HttpOnly、Secure 和 SameSite。
- 前端查询成功后会清空身份证明号码输入框。

“不保存”不等于“服务器看不到”：网站版必须短暂处理登录字段才能代你连接教大。若不接受这一点，请使用本机插件版。

## 管理员：部署网站

网站使用 Node.js、PostgreSQL、Caddy 和 Docker Compose。PostgreSQL只保存网站账号与 session；签证资料不建立数据表。

### 要求

- Ubuntu 22.04／24.04 或同类 Linux
- 至少 1 GB 内存，建议 2 GB
- 域名 A 记录指向服务器
- 防火墙开放 TCP 80、443 和 UDP 443
- Docker Engine、Docker Compose Plugin 和 Git

### 首次部署

```bash
git clone https://github.com/qzblue/eduhkvisa.git
cd eduhkvisa
cp .env.example .env
nano .env
```

`.env` 示例：

```env
DOMAIN=eduhkvisa.cust.edu.kg
POSTGRES_PASSWORD=请填写随机长密码
SESSION_SECRET=请填写至少32位随机字符串
ALLOW_REGISTRATION=true
```

生成随机字符串：

```bash
openssl rand -hex 32
```

启动：

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app caddy
```

访问 `https://你的域名/health`，看到 `{"ok":true}` 表示网站服务正常。

### 更新

```bash
cd eduhkvisa
git pull --ff-only
docker compose up -d --build
```

### 备份

```bash
docker compose exec -T db pg_dump -U eduhkvisa eduhkvisa > eduhkvisa-backup.sql
```

备份只应包含网站用户和 session，但仍须加密保存，不要提交 GitHub。

## 项目结构

```text
manifest.json          插件权限配置
background.js          插件标签页与请求协调
content.js             使用浏览器教大会话读取接口
index.html             插件查询结果页
dashboard.css/js       插件界面与资料整理
启动签证助手.cmd       Windows 快速启动入口
start-visa-helper.ps1  浏览器启动和中文提示

server/
  src/server.js          网站账号、会话与查询 API
  src/official-client.js 教大临时登录及详情请求
  src/sanitize.js        返回字段白名单
  src/migrations.sql     仅网站账号数据表
  public/                网站前端
  test/                  安全字段测试

docker-compose.yml     网站、数据库和 HTTPS 网关
Caddyfile              自动 HTTPS 与反向代理
.env.example           部署环境变量示例
```

## 常见问题

### 提示“登录资料不正确”

确认填写的是教大申请编号、申请时登记的完整身份证明号码、正确出生日期和对应入学学期。不要填写本站邮箱或本站密码。

### 查不到入学学期

可用学期实时来自教大官网。请刷新页面；若仍失败，可能是教大系统暂时维护。

### 网站版突然不能查询

教大可能更新登录接口、增加验证码或限制服务器网络。本站不会绕过验证码或安全控制；可先使用本机插件，并等待项目适配官方正常流程。

### 找到 MEEN 编号但不能下载

这通常不代表查询失败。是否可下载以入境处系统的审批、缴费和签发结果为准。

## 本地开发

插件修改后，在 `chrome://extensions` 点击“重新加载”，并刷新教大官网页面。

服务端：

```bash
cd server
npm install
npm test
npm start
```
