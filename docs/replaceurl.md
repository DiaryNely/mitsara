-- Vérifier l'URL actuelle du logo
SELECT name, value FROM ps_configuration WHERE name LIKE '%LOGO%';

-- Modifier l'URL du logo pour utiliser HTTP au lieu de HTTPS
UPDATE ps_configuration SET value = 'http://localhost/ps/img/logo.png' 
WHERE name = 'PS_LOGO';

-- Vérifier aussi le logo de l'administration
UPDATE ps_configuration SET value = 'http://localhost/ps/img/logo.png' 
WHERE name = 'PS_LOGO_ADMIN';