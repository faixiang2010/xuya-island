CREATE TABLE sys_users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nickname TEXT NOT NULL, password_hash TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, change_password INTEGER NOT NULL DEFAULT 1,
    auth_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE sys_roles (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1, protected INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sys_menus (
    id TEXT PRIMARY KEY, parent_id TEXT, title TEXT NOT NULL, path TEXT NOT NULL DEFAULT '',
    permission TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE sys_user_roles (
    user_id TEXT NOT NULL REFERENCES sys_users(id), role_id TEXT NOT NULL REFERENCES sys_roles(id),
    PRIMARY KEY(user_id,role_id)
);
CREATE TABLE sys_role_menus (
    role_id TEXT NOT NULL REFERENCES sys_roles(id), menu_id TEXT NOT NULL REFERENCES sys_menus(id),
    PRIMARY KEY(role_id,menu_id)
);
CREATE TABLE sys_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO sys_settings VALUES ('captcha_mode','always');
CREATE TABLE sys_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL, target_id TEXT NOT NULL DEFAULT '', success INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE learner_profiles (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL UNIQUE REFERENCES sys_users(id),
    timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai', created_at TEXT NOT NULL
);
INSERT INTO sys_roles VALUES ('super-admin','超级管理员','账户、权限和家庭学习管理',1,1);
INSERT INTO sys_roles VALUES ('learner','学习者','自己的课堂、作品与成长',1,1);
INSERT INTO sys_roles VALUES ('developer','成人开发者','仅本机使用的开发工作台',1,1);
INSERT INTO sys_menus VALUES ('map',NULL,'学习地图','/','learning:read','menu',10,1);
INSERT INTO sys_menus VALUES ('games',NULL,'游戏中心','/games','games:use','menu',20,1);
INSERT INTO sys_menus VALUES ('classroom',NULL,'编程课堂','/classroom','classroom:use','menu',30,1);
INSERT INTO sys_menus VALUES ('adventure',NULL,'故事冒险','/adventure/town-cup-order','adventure:use','menu',40,1);
INSERT INTO sys_menus VALUES ('studio',NULL,'小奇创作室','/studio','studio:use','menu',50,1);
INSERT INTO sys_menus VALUES ('works',NULL,'我的作品','/works','works:manage','menu',60,1);
INSERT INTO sys_menus VALUES ('growth',NULL,'我的成长','/growth','learning:read','menu',70,1);
INSERT INTO sys_menus VALUES ('execute','classroom','运行Python','','execution:run','action',31,1);
INSERT INTO sys_menus VALUES ('codex',NULL,'codex','/codex','codex:access','menu',80,1);
INSERT INTO sys_menus VALUES ('codex-workspace','codex','工作区与文件','','codex:workspace','action',81,1);
INSERT INTO sys_menus VALUES ('codex-terminal','codex','终端','','codex:terminal','action',82,1);
INSERT INTO sys_menus VALUES ('codex-plugin','codex','插件连接','','codex:plugin','action',83,1);
INSERT INTO sys_menus VALUES ('system',NULL,'家庭管理','/admin','system:manage','menu',90,1);
INSERT INTO sys_menus VALUES ('python','system','Python环境','','system:python','action',91,1);
INSERT INTO sys_menus VALUES ('rewards','system','礼物与审批','','rewards:manage','action',92,1);
INSERT INTO sys_role_menus SELECT 'learner',id FROM sys_menus WHERE id IN ('map','games','classroom','adventure','studio','works','growth','execute');
INSERT INTO sys_role_menus SELECT 'developer',id FROM sys_menus WHERE id LIKE 'codex%';
INSERT INTO sys_role_menus SELECT 'super-admin',id FROM sys_menus;
ALTER TABLE works ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE attempts ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE exercise_attempts ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE studio_projects ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
ALTER TABLE codex_conversations ADD COLUMN owner_id TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_works_owner ON works(owner_id,gmt_modified DESC);
CREATE INDEX idx_studio_owner ON studio_projects(owner_id,updated_at DESC);
CREATE INDEX idx_codex_owner ON codex_conversations(owner_id,updated_at DESC);
ALTER TABLE lesson_progress RENAME TO legacy_lesson_progress;
CREATE TABLE lesson_progress (
    owner_id TEXT NOT NULL DEFAULT '', lesson_id TEXT NOT NULL, lesson_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('not-started','in-progress','completed','needs-review')),
    hint_level INTEGER NOT NULL DEFAULT 0 CHECK(hint_level BETWEEN 0 AND 3),
    reference_viewed INTEGER NOT NULL DEFAULT 0, reflection TEXT NOT NULL DEFAULT '',
    parent_observation TEXT NOT NULL DEFAULT '', gmt_modified TEXT NOT NULL,
    PRIMARY KEY(owner_id,lesson_id,lesson_version)
);
INSERT INTO lesson_progress SELECT '',lesson_id,lesson_version,status,hint_level,reference_viewed,reflection,parent_observation,gmt_modified FROM legacy_lesson_progress;
DROP TABLE legacy_lesson_progress;
