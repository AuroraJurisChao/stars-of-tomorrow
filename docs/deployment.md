# 配置、部署与维护

## 1. 环境要求

- Node.js 22或兼容的新版本；
- MySQL 8.0；
- Docker与Docker Compose（推荐）；
- 正式公网部署还需要服务器、域名和可用的HTTPS证书流程。

## 2. 生成私密配置

在项目根目录运行：

```bash
npm run setup:env
```

该命令创建 `.env` 并生成随机数据库密码、root密码和应用密钥。它不会覆盖已有文件。也可以参考 `.env.example` 手动创建。

`.env`、数据库备份与 `runtime-credentials/` 已被Git排除。不要把它们复制进公开Issue、截图或仓库。

主要配置：

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 本机迁移和初始化使用的MySQL连接串 |
| `MYSQL_DATABASE`／`MYSQL_USER`／`MYSQL_PASSWORD` | Compose数据库配置 |
| `MYSQL_ROOT_PASSWORD` | 数据库root密码 |
| `APP_ID`／`APP_SECRET` | 应用标识与服务端密钥 |
| `APP_BIND`／`APP_PORT` | 应用监听地址，默认仅本机3000端口 |
| `DB_BIND`／`DB_PORT` | 本机数据库映射，默认仅127.0.0.1 |
| `LLM_API_KEY` | 模型服务密钥，不在浏览器中暴露 |
| `LLM_BASE_URL`／`LLM_MODEL` | OpenAI兼容接口与模型 |
| `DOMAIN`／`ACME_EMAIL` | Caddy HTTPS域名与证书邮箱 |

## 3. 自定义团队

编辑 `contracts/constants.ts`：

```ts
export const DISTRICTS = [
  { id: "our-team", name: "我们的团队", enabled: true, sortOrder: 10 },
] as const;

export const DEFAULT_DISTRICT_ID: DistrictId = "our-team";
export const DEFAULT_PUBLIC_DISTRICT_ID = DEFAULT_DISTRICT_ID;

export const MEMBERS = [
  { name: "成员甲", pinyinKey: "member-a" },
  { name: "成员乙", pinyinKey: "member-b" },
] as const;
```

姓名在账号表中是唯一的。同名不同人需要采用组织内认可的唯一显示方式。`pinyinKey`只用于稳定排序，使用小写ASCII字母、数字或连字符，不需要包含密码或其他信息。

默认初始化把 `MEMBERS` 和通用组织者加入 `DEFAULT_DISTRICT_ID`。如果配置多个选区，其他选区会先保持空名单；需要多团队同时使用时，应扩展 `db/provision.ts` 的选区关系配置，并做权限隔离测试。不同公司或互不相关的团队更建议分别部署独立实例。

## 4. 初始化规则

首次执行迁移：

```bash
npm run db:migrate
```

本地虚构体验：

```bash
npm run provision:demo
```

真实团队初始化：

```bash
npm run provision
```

真实团队命令为每个新账号生成独立随机密码，写入 `runtime-credentials/`。已存在账号不会被重置，已有密码不会重新出现在CSV中。公开演示模式只能用于原始虚构名单，修改名单后会拒绝运行。

请在活动开始前完成初始化。不要对已有真实活动库运行来源不明的种子脚本，也不要为了重新初始化而删除数据库。

## 5. 本地开发

```bash
npm ci
npm run setup:env
docker compose -f deploy/compose.yaml up -d db
npm run db:migrate
npm run provision:demo
npm run dev
```

打开 http://localhost:3000 。开发服务器同时提供前端与服务端API，不能只运行静态预览来验证业务功能。

## 6. 全Docker部署

构建镜像并初始化：

```bash
npm run setup:env
docker compose -f deploy/compose.yaml build app
docker compose -f deploy/compose.yaml run --rm app node dist/migrate.js
docker compose -f deploy/compose.yaml run --rm app node dist/provision.js --demo
docker compose -f deploy/compose.yaml up -d app
```

以上是本地虚构演示。真实团队不要使用 `--demo`，可通过一次性容器生成随机凭据并取回：

```bash
docker compose -f deploy/compose.yaml run --name stars-provision app node dist/provision.js
docker cp stars-provision:/app/runtime-credentials ./runtime-credentials
docker rm stars-provision
```

取回后立即将 `runtime-credentials/` 当作敏感文件保护。检查应用：

```bash
docker compose -f deploy/compose.yaml ps
curl http://127.0.0.1:3000/api/trpc/ping
```

应用和MySQL默认只监听本机或容器内网。不要直接将3000或3306端口暴露到公网。

## 7. 域名与HTTPS

`deploy/Caddyfile` 使用 `DOMAIN` 和 `ACME_EMAIL`，并把请求转发到 `APP_PORT`。先在 `.env` 中配置真实域名和证书邮箱，确认DNS已指向服务器、防火墙允许80/443，再启动代理：

```bash
docker compose \
  -f deploy/compose.yaml \
  -f deploy/compose.proxy.yaml \
  up -d
```

`compose.proxy.yaml` 使用主机网络，适合Linux服务器。中国内地服务器还需遵守备案及当地网络要求；不要假设更换地域或域名可以免除适用义务。

## 8. 备份与恢复

备份必须包含欣赏卡、匿名关系、账号哈希、活动状态、关键词版本和成绩。使用 Compose 的Linux示例：

```bash
mkdir -p backups
docker compose -f deploy/compose.yaml exec -T db \
  sh -c 'exec mysqldump --single-transaction -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > "backups/stars-$(date +%Y%m%d-%H%M%S).sql.gz"
```

恢复只在明确目标、已停写并完成最新备份时进行。优先恢复到隔离空库核对表数、账号数、欣赏卡数和活动状态，不要直接覆盖正在使用的正式库。备份本身含密码哈希与私人评语，必须加密并限制访问。

## 9. 更新与验收

更新前保留源码版本和最新数据库备份。数据库结构变化应通过新的Drizzle迁移追加，不要修改已经部署的历史迁移来伪装一致。

每次更新至少执行：

```bash
npm run check
npm test
npm run build
```

然后在真实部署环境验证登录、书写、匿名、截止、关键词、三个游戏、排名、大屏和退出。构建成功不能代替真实页面与权限验收。

## 10. 运维注意事项

- 定期备份并进行隔离恢复演练；
- 检查磁盘、证书、流量、容器健康和日志大小；
- 大模型密钥只放在服务端受保护配置中；
- 不要在公开页面展示组织者审计信息；
- 多选区或多人活动前进行相应并发和权限测试；
- 正式成绩没有试玩清理入口，任何数据修复都先备份并限定影响范围。
