# TinyPendingItem

轻量级个人待办任务（纯前端版）。

本分支是 **纯前端版本**（与 main 的轻后端版本并列）：

- 无后端、无数据库：所有数据（账号、待办、头像、主题）保存在浏览器 `localStorage`
- `npm run dev` 即可独立运行，`npm run build` 产出静态 `dist/`，任意静态托管可部署
- 导出/导入 JSON 格式与后端版本一致，可互相迁移数据

## 运行

```bash
npm install
npm run dev        # 开发（vite，无需任何服务端）
npm run test       # vitest 单测
npm run typecheck  # vue-tsc 类型检查
npm run build      # 构建静态 dist/
```

## 账号说明（重要）

登录/注册界面保持原样，但都在本地完成：

- 注册即在本浏览器新建一个本地账号，数据按账号隔离（`localStorage` 中按 userId 分键存放）
- 重装浏览器/清理站点数据会**永久丢失数据**，请用界面上的"导出 JSON"定期备份
- 密码只在本地用 SHA-256 弱哈希做会话切换，**不具备真正的安全性**，请勿使用真实常用密码
- 同一浏览器登录不同账号可切换数据；跨浏览器/跨设备不同步（如需同步请使用后端版本）

## 数据存储键

| 键 | 内容 |
|---|---|
| `tiny-pending-item:token` | 当前会话（本地账号 id） |
| `tiny-pending-item:local:users` | 本地账号列表（含口令哈希） |
| `tiny-pending-item:local:domains:<userId>` | 各账号的域（待办场景分组） |
| `tiny-pending-item:local:items:<userId>` | 各账号待办数据 |
| `tiny-pending-item:local:seq` | 递增 id 高水位 |
| `tiny-pending-item:domain` | 当前选中的域（跨会话偏好） |
| `tiny-pending-item:sort` | 排序方式（跨会话偏好） |

## 域（待办场景隔离）

待办按“域”分组隔离，如工作、生活、学习：

- 新账号自动内置 **工作 💼 / 生活 🏠 / 学习 📚** 三个域；旧档案首次访问时自动补种并把存量待办归入第一个域
- 侧栏“域”区可切换视图，“全部域”显示所有待办（卡片上带归属域标记）
- 点侧栏“域”标题右侧的齿轮打开 **管理域**：新增（名称 1-10 字 + 图标）、重命名/换图标、删除（域内有待办时需先移走或清空；至少保留一个域）
- 添加待办与明细面板均可选择/移动域；每个账号上限 20 个域
- 导出 JSON 包含 `domains` 字段；导入时文件中的域按名称合并，旧格式文件（无域信息）的条目归入第一个域

目录结构与功能说明见 [docs/](docs/)（架构文档描述的是后端版本，本分支把数据层换成了 `src/api/client.ts` 中的 localStorage 实现，接口和行为与其保持一致）。
