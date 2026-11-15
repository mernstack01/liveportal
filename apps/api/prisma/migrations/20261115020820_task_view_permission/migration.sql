-- Board va tasklarni ko'rish endi alohida ruxsat (task.view). Mijoz (guest) uni olmaydi.
-- Tizim rollarini seed yangilaydi; bu yerda foydalanuvchi yaratgan loyiha rollari:
-- task bilan ishlay oladigan har bir rol tasklarni ko'ra olishi ham kerak.
UPDATE "Role"
SET "permissions" = array_append("permissions", 'task.view')
WHERE "scope" = 'PROJECT'
  AND NOT ('task.view' = ANY("permissions"))
  AND "permissions" && ARRAY['task.create', 'task.update', 'task.assign', 'task.close', 'task.comment']::text[];

-- Workspace xodimlari jamoa ro'yxatini ko'radi (team.view); yangi "Mijoz" roli ko'rmaydi.
UPDATE "Role"
SET "permissions" = array_append("permissions", 'team.view')
WHERE "scope" = 'WORKSPACE'
  AND NOT ('team.view' = ANY("permissions"));
