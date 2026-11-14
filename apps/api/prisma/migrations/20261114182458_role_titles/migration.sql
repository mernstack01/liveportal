-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "title" TEXT;


-- Ma'lumot: "mentor" tizim roli "developer" (Dasturchi) ga aylandi. Rolga bog'langan a'zolar saqlanadi.
UPDATE "Role" SET "name" = 'developer' WHERE "name" = 'mentor' AND "isSystem" = true;
