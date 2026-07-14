# 教大签证查询中心

这是一个帮助香港教育大学学生查找入境处申请档案编号的开源项目，同时包含：

1. **浏览器插件版本**：资料只在学生自己的电脑上显示，最简单、最私密。
2. **多用户网站版本**：学生登录签证中心网站，通过一次性连接码把插件查询结果显示到自己的网页会话。

线上域名：<https://eduhkvisa.cust.edu.kg>

> 本项目不是香港教育大学或香港入境事务处的官方产品。申请档案编号、签证签发和下载结果均以官方网站为准。

## 先看懂：MEEN 编号是什么？

教大接口返回的 `immdRefNo`，例如 `MEEN-XXXXXXX-XX`，是入境处的**申请档案编号**。

电子签证签发后，下载时通常需要填写：

- 申请档案编号（例如 MEEN 开头的编号）
- 申请人的出生日期
- 申请时提供的旅行证件号码首四个字母或数字

请注意：**找到 MEEN 编号不等于签证已经签发。** 根据香港入境处说明，申请获批并缴付费用（如适用）后才可下载电子签证。

- [香港政府：下载电子签证](https://www.gov.hk/tc/residents/immigration/nonpermanent/downloadevisa.htm)
- [香港政府：申请档案编号说明](https://www.gov.hk/tc/residents/immigration/nonpermanent/apprefnumber.htm)

## 小白用户：只使用插件（推荐）

这种方法不需要注册网站账号。

### 第一步：下载

1. 打开本项目 GitHub 页面。
2. 点击绿色 **Code** 按钮。
3. 点击 **Download ZIP**。
4. 下载完成后右键 ZIP，选择“全部解压”。不要直接在压缩包内运行。

### 第二步：安装插件

#### Windows 一键启动

进入解压后的文件夹，双击 `启动签证助手.cmd`。它会调用同目录的 `start-visa-helper.ps1`，然后自动打开浏览器和教大登录页面。请保持这两个文件在同一文件夹内。

#### Chrome 手动安装

1. 在地址栏输入 `chrome://extensions` 并回车。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择刚才解压的整个 `eduhkvisa` 文件夹。
5. 点击浏览器右上角拼图图标，把“教大签证进度助手”固定到工具栏。

Edge 用户把第一步地址换成 `edge://extensions`，其余操作相同。

### 第三步：查询

1. 使用同一个浏览器打开[教大申请系统](https://pappl.eduhk.hk/VMS/admission/applicant/ImmD/submission)。
2. 正常登录自己的教大账号，并保持该页面开启。
3. 点击工具栏里的“教大签证进度助手”。
4. 点击“查询我的签证资料”。
5. 页面会突出显示 MEEN 开头的申请档案编号，并引导你去入境处官网下载电子签证。

插件不会要求你把教大密码、Cookie 或 XSRF token复制出来。

## 小白用户：使用多用户签证中心网站

网站版本适合多人同时使用，但每位学生仍需安装一次插件。

1. 打开 <https://eduhkvisa.cust.edu.kg>。
2. 注册网站账号。这里设置的是**签证中心密码，不是教大密码**。
3. 按页面提示安装插件，并在同一个浏览器登录教大官网。
4. 回到签证中心，点击“我已准备好，开始查询”。
5. 网站生成一条 10 分钟有效的一次性连接码，点击复制。
6. 打开插件并查询资料。
7. 在插件页面底部找到“同步到网站”，粘贴整条连接码。
8. 点击“发送到我的网站页面”，再回到签证中心，资料会自动显示。

每条连接码只属于当前登录的网站用户，只能使用一次。多个学生可同时查询，不会互相看到资料。

## 为什么网站不能直接登录教大？

教大资料受登录 Cookie、XSRF 验证和浏览器同源策略保护。普通网站不能读取 `pappl.eduhk.hk` 的登录会话。

本项目不会在服务器上代学生登录教大，因为那意味着服务器要接收第三方账号密码和登录 Cookie，风险很高，也可能受到验证码、双重验证及官方规则限制。安全流程是：

```text
学生在教大官网登录
        ↓
插件在学生电脑上读取本人资料
        ↓
使用 10 分钟一次性连接码
        ↓
只把页面需要的字段发送给当前网站用户
        ↓
网页收到后立即删除临时服务器记录
```

## 管理员：部署服务器

服务器版本使用 Node.js、PostgreSQL、Caddy 和 Docker Compose。Caddy 会自动申请并续期 HTTPS 证书。

### 服务器要求

- Ubuntu 22.04／24.04 或同类 Linux
- 至少 1GB 内存，建议 2GB
- 域名 A 记录已指向服务器 IP
- 防火墙开放 TCP 80、443 和 UDP 443
- 已安装 Docker Engine、Docker Compose Plugin 和 Git

### 部署步骤

```bash
git clone https://github.com/qzblue/eduhkvisa.git
cd eduhkvisa
cp .env.example .env
nano .env
```

编辑 `.env`：

```env
DOMAIN=eduhkvisa.cust.edu.kg
POSTGRES_PASSWORD=请填写随机长密码
SESSION_SECRET=请填写至少32位随机字符串
PAIRING_PEPPER=请填写另一条至少32位随机字符串
ALLOW_REGISTRATION=true
```

可以使用以下命令生成随机字符串：

```bash
openssl rand -hex 32
```

启动：

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app caddy
```

打开 `https://eduhkvisa.cust.edu.kg/health`，看到 `{"ok":true}` 表示服务正常。

### 更新版本

```bash
cd eduhkvisa
git pull --ff-only
docker compose up -d --build
docker image prune -f
```

### 数据备份

账号数据保存在 Docker 的 `postgres_data` volume。建议定期执行 PostgreSQL 备份：

```bash
docker compose exec -T db pg_dump -U eduhkvisa eduhkvisa > eduhkvisa-backup.sql
```

备份包含用户邮箱和密码哈希，应加密保存，不要提交到 GitHub。

## 隐私和多用户隔离

- 教大密码和登录 Cookie 永远不发送到本站服务器。
- 网站密码使用带随机盐的 scrypt 哈希保存，不保存明文。
- 网站登录会话保存在 PostgreSQL，支持多实例和多用户并发。
- 一次性连接码使用随机密钥并经服务器密钥散列后保存。
- 插件发送前已经移除申请状态、上传文件链接和完整文件清单。
- 查询资料读取完成后前端立即删除；未完成记录 10 分钟后自动清理。
- 每次查询都校验网站用户 ID，其他用户无法读取该记录。
- 生产环境强制 HTTPS，并设置 HttpOnly、Secure、SameSite Cookie。

## 项目结构

```text
manifest.json          插件权限配置
background.js          插件标签页与请求协调
content.js             在教大页面登录会话内读取接口
index.html             插件信息页面
dashboard.css          插件页面样式
dashboard.js           插件资料整理及网站同步
启动签证助手.cmd       Windows 一键启动插件
start-visa-helper.ps1  可靠处理中文提示与浏览器启动

server/
  src/server.js        多用户 API、会话与一次性连接码
  src/migrations.sql   PostgreSQL 数据表
  public/              登录及签证中心网页
  test/                安全字段过滤测试

docker-compose.yml     网站、数据库和 HTTPS 网关
Caddyfile              自动 HTTPS 与反向代理
.env.example           服务器环境变量示例
```

## 常见问题

### 插件提示“请先打开并登录”

确认教大官网和插件在同一个 Chrome／Edge 中运行，并刷新一次教大页面。

### 网站一直显示“正在等待插件”

确认复制的是完整连接码，包含 `https://` 和最后的 `#...`。连接码超过 10 分钟后需要重新生成。

### 浏览器询问是否允许插件访问签证中心

点击允许。插件只请求当前签证中心域名的权限，用于把本次查询结果发回你的网页会话。

### 找到 MEEN 编号但官网下载不到

这通常不代表工具出错。入境处只会在申请获批、完成缴费（如适用）并签发电子签证后提供下载。请以入境处通知和官网结果为准。

## 本地开发测试

插件没有第三方运行依赖。修改后在 `chrome://extensions` 点击“重新加载”，并刷新教大官网页面。

服务端：

```bash
cd server
npm install
npm test
```
