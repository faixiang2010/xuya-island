-- 导航命名与产品统一：codex 是面向大人的开发工作台，用中文名说明它属于同一座小岛，
-- 而不是一串夹在中文导航里的英文标识。
UPDATE sys_menus SET title='大人工作台' WHERE id='codex';
