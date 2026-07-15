CREATE TABLE IF NOT EXISTS portal_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 旧版本曾短暂保存查询结果。新版只在单次服务器请求内处理，启动时删除旧表。
DROP TABLE IF EXISTS visa_query_requests;
