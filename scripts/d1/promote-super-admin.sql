-- Usage: pnpm exec wrangler d1 execute your-markup-image-edit-db --remote --file=scripts/d1/promote-super-admin.sql
-- Set your own administrator email before running this command.
UPDATE mie_user SET role = 'admin' WHERE email = 'admin@example.com';
