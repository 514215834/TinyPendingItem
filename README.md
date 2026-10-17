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
| `tiny-pending-item:local:items:<userId>` | 各账号待办数据 |
| `tiny-pending-item:local:seq` | 递增 id 高水位 |

目录结构与功能说明见 [docs/](docs/)（架构文档描述的是后端版本，本分支把数据层换成了 `src/api/client.ts` 中的 localStorage 实现，接口和行为与其保持一致）。
