Identity Server - Actualizaciones y pendientes

Registro de lo ya implementado y de todo lo que falta por implementar en el proyecto.
Fecha de última actualización: 2026-09-07.


IMPLEMENTADO - Fase 0

Paso 1 - Scaffolding. NestJS 11 con TypeScript estricto; dependencias @nestjs/typeorm, typeorm, pg, @nestjs/config, class-validator, class-transformer y argon2; docker-compose.yml con PostgreSQL 16 en el puerto 5433 del host; configuración validada desde el archivo .env mediante validateEnv y loadConfig.

Paso 2 - Capa de datos. TypeOrmModule.forRootAsync conectado a la base de datos; BaseEntity con uuid, createdAt y updatedAt, y TenantEntity con organizationId; DataSource para el CLI y scripts de migración migration:run, migration:revert, migration:show y migration:generate.

Paso 3 - JWT RS256 implementado desde cero con node:crypto y sin librerías. JwtService con firma y verificación y validación completa de claims; kid según RFC 7638; script generate-keys.ts ejecutable con npm run keys:generate; endpoint GET /.well-known/jwks.json; errores tipados y tests unitarios.

Paso 4 - TokenService, tokens opacos de refresh. Archivo src/security/token.service.ts, registrado en el SecurityModule global (src/security/security.module.ts) e importado en AppModule. generate() produce un token opaco de 32 bytes con randomBytes codificado en base64url junto con su SHA-256 en hexadecimal; en la base de datos solo se guardará ese hash y nunca el valor en claro. hash() es determinista para un mismo token. verify() rehashea el token presentado y compara los dos digests con crypto.timingSafeEqual, descartando sin lanzar excepción cualquier hash almacenado de longitud distinta a 32 bytes. Tests unitarios de unicidad (token y hash), estabilidad del hash, verificación correcta e incorrecta, tokens alterados y uso efectivo de timingSafeEqual.


IMPLEMENTADO - Fase 1

Paso 5 - Entidades concretas y primera migración. Organization (src/entities/organization.entity.ts) con name, slug único, status (enum active/suspended/cancelled) y subscriptionTier (enum free/pro/enterprise). User (src/entities/user.entity.ts) con email único, passwordHash, status (enum active/locked/disabled), failedLoginAttempts, lockedUntil y passwordChangedAt. Membership (src/entities/membership.entity.ts) extiende TenantEntity (organizationId) y añade userId y roleId, con índice único compuesto (organizationId, userId). Registradas en src/database/entities.ts. Migración inicial generada y aplicada (CreateOrganizationsUsersMemberships).


Paso 6 - PasswordService con Argon2id. Archivo src/security/password.service.ts, registrado en SecurityModule. hash() usa argon2id con m=19456 KiB, t=2, p=1 (OWASP). verify() delega en argon2.verify (comparación en tiempo constante) y nunca lanza: hash corrupto o contraseña incorrecta resuelven en false. needsRehash() parsea los parámetros embebidos en el hash almacenado (formato PHC) y devuelve true si difieren de los vigentes, para que el llamador re-hashee de forma transparente tras un login exitoso. Política de contraseñas en src/security/password-policy.ts: función isStrongPassword y decorador @IsStrongPassword() para class-validator, mínimo 12 caracteres con mayúscula, minúscula, dígito y símbolo (listo para los DTOs de registro/cambio de contraseña de los pasos 7 y 12). Tests unitarios de hash, verify (correcta, incorrecta, hash corrupto) y needsRehash (vigente, desactualizado, formato irreconocible), y de la política de contraseñas.


Paso 7 y 8 - Endpoints de registro y login, con emisión inicial de tokens (AuthService.issueTokens adelantado desde el Paso 8, porque el registro ya necesita emitir sesión y tokens). Módulo src/modules/auth/. POST /auth/register (AuthController) ejecuta una única transacción: crea Organization (slug derivado del nombre, único), User (passwordHash con Argon2id) y Membership con roleId fijo OWNER_ROLE_ID (uuid reservado en auth.constants.ts hasta que exista el catálogo real de roles en la Fase 3), además de la Session y el primer par de tokens. POST /auth/login verifica credenciales, resuelve la organización (automática si el usuario tiene una sola membresía; si tiene varias exige organizationSlug), bloquea la cuenta 15 minutos tras 5 intentos fallidos (auto-desbloqueo al expirar la ventana), resetea el contador al iniciar sesión con éxito y re-hashea la contraseña de forma transparente si PasswordService.needsRehash lo indica. AuthService.issueTokens firma el access token JWT RS256 (15 min, claims sub/org/sid/jti/roles/permissions/pwd_ver/token_type; roles y permissions van con placeholders hasta la Fase 3) y persiste el refresh token opaco (hash) en RefreshToken con TTL configurable (REFRESH_TOKEN_TTL_SECONDS, 30 días por defecto). Los fallos de login, bloqueos, registros y logins exitosos se registran en la nueva entidad SecurityEvent (src/entities/security-event.entity.ts, tabla ligera de eventos de seguridad; la auditoría inmutable con cadena de hashes es la Fase 4). Se añadió ValidationPipe global en main.ts (whitelist, forbidNonWhitelisted, transform) para que los DTOs (RegisterDto, LoginDto) se validen. Probado manualmente con curl: registro, registro duplicado (409), contraseña débil (400), login correcto, 5 logins fallidos y bloqueo (401), verificación en base de datos de users/memberships/sessions/refresh_tokens/security_events.


IMPLEMENTADO - Fase 2

Paso 9 - Entidades Session y RefreshToken. src/entities/session.entity.ts y src/entities/refresh-token.entity.ts, registradas en src/database/entities.ts. Session con userId, orgId, ipHash, userAgentHash, lastSeenAt, revokedAt y revokedReason (sin FK real a User/Organization todavía: esas entidades son de la Fase 1, pendiente). RefreshToken con sessionId, tokenHash único, issuedAt, expiresAt, rotatedAt, replacedByTokenId, status (enum active/rotated/revoked) y revokedReason. Migración inicial generada y aplicada (CreateSessionsAndRefreshTokens).


PENDIENTE DE IMPLEMENTAR


Fase 2 - Refresh tokens rotativos y gestión de sesiones, la parte crítica

Paso 10 - Rotación con detección de reutilización. Archivo src/modules/auth/refresh-token.service.ts. El método rotate hashea el token presentado y abre una transacción con SELECT ... FOR UPDATE sobre la fila. Si el estado es active se rota marcando el token como rotated, insertando el nuevo eslabón y emitiendo el nuevo par. Si el estado es rotated significa que hay reutilización y por tanto un posible robo, por lo que se revoca la sesión completa y todos sus tokens, se registra el SecurityEvent refresh_reuse y la auditoría, y se responde 401. Si el estado es revoked se responde 401. Incluir una ventana de gracia configurable para la misma IP y unos segundos que evite falsos positivos por reintentos de red.

Paso 11 - Entrega segura y endpoint POST /auth/refresh. Entregar el refresh token en una cookie HttpOnly, Secure y SameSite igual a Strict, con Path igual a /auth/refresh para aplicaciones web, y ofrecer JSON de forma opcional para clientes API.

Paso 12 - Endpoints de gestión de sesiones. GET /auth/sessions para listar las sesiones activas con el dispositivo y la última actividad. POST /auth/sessions con el id de sesión para revocar una sesión concreta. POST /auth/logout para cerrar la sesión actual. POST /auth/logout-all para cerrar todas las sesiones. POST /auth/change-password revoca todas las sesiones y el claim pwd_ver invalida de inmediato los access tokens anteriores. El guard debe consultar una caché en memoria de los sid revocados con respaldo en la base de datos para invalidar los access tokens emitidos antes de su expiración.

Paso 13 - RateLimitGuard propio. Implementar una ventana deslizante en memoria por IP e identificador sobre los endpoints /auth/login y /auth/refresh. El uso de Redis queda reservado como extensión para entornos con varias instancias.


Fase 3 - RBAC y ABAC

Paso 14 - Modelo de permisos y roles. La Permission forma el catálogo global con claves como users:create, el módulo y la descripción, sembradas en una migración. El Role tiene orgId anulable para los roles integrados y RolePermission relaciona roles y permisos de muchos a muchos. Sembrar los roles owner, admin y member. Embeber el claim permissions del tenant activo dentro del JWT.

Paso 15 - Guards y decoradores propios. JwtAuthGuard verifica la firma RS256 mediante el kid, los claims y el estado de la sesión. RolesGuard junto con los decoradores RequirePermissions y RequireRoles restringen el acceso por permiso o rol. El contexto de tenant se toma del claim org o del header X-Org-Id.

Paso 16 - Aislamiento multi-tenant en la capa de datos. Crear un helper base que inyecte organizationId del contexto en todas las consultas. Una consulta sin tenant debe fallar por diseño para detectar errores de forma inmediata.

Paso 17 - ABAC con condiciones de atributos sobre RBAC. Archivo src/modules/abac/policy-evaluator.ts. Usar una lista blanca de operadores como eq, ne, in, owns, gt y lt, sin emplear eval. Evaluar atributos como la propiedad del recurso comparando resource.ownerId con subject.id, el tenant, el rol, el estado o nivel del recurso y el plan de suscripción del sujeto. Persistir las reglas en la tabla PermissionRule con el permissionId y la condición en JSON. AuthorizationService.authorize recibe el usuario, la acción y el recurso y combina el permiso RBAC con las reglas ABAC. El guard AbacEnforce resuelve el recurso desde la petición.

Paso 18 - Endpoints de administración RBAC. CRUD de roles por organización con el permiso roles:manage. Asignar y quitar permisos a los roles y asignar un rol a cada membership. Endpoint GET /permissions para consultar el catálogo. Añadir rutas de ejemplo protegidas con condiciones ABAC, por ejemplo editar un recurso solo si se es el propietario o un administrador.


Fase 4 - Auditoría inmutable

Paso 19 - AuditLog de solo inserción. La entidad debe tener id, orgId, actorId, action, severity, targetType, targetId, ip, userAgent, metadata en JSONB, createdAt, seq, prevHash y hash. AuditService.record debe ser la única vía de escritura y debe ejecutarse de forma síncrona para las acciones críticas de seguridad.

Paso 20 - Inmutabilidad reforzada. Construir una cadena de hashes por tenant donde el hash sea el SHA-256 de los campos canónicos concatenados con el prevHash. Añadir un trigger SQL que rechace las operaciones UPDATE y DELETE lanzando una excepción. El endpoint GET /audit/verify recalcula la cadena y detecta cualquier manipulación.

Paso 21 - Instrumentación de acciones críticas. Registrar login con éxito o fallo, bloqueo de cuenta, registro, refresh, reutilización de refresh, logout, logout-all, cambio de contraseña, cambios de roles, permisos y membresías, denegaciones ABAC de alta severidad e intentos limitados por rate limiting.

Paso 22 - Consulta de auditoría. Endpoint GET /audit con filtros por organización, actor, acción, rango de fechas, severidad y paginación, restringido al permiso audit:read.


Fase 5 - Endurecimiento y pruebas

Paso 23 - Endurecimiento HTTP. Aplicar Helmet, CORS estricto, cabeceras de seguridad y Cache-Control con valor no-store en las respuestas que contengan tokens. Mantener los secretos fuera del repositorio y documentar la rotación de claves JWT.

Paso 24 - Suite de tests completa. Tests unitarios para TokenService, PasswordService, la rotación con reutilización y el PolicyEvaluator. Tests e2e con supertest sobre una base de datos de prueba que cubran el registro, el login, el refresh con rotación, la reutilización del token antiguo con revocación de sesión y auditoría, el bloqueo de cuenta, las denegaciones RBAC con 403, las condiciones ABAC y el intento de UPDATE sobre audit_log que debe lanzar excepción, además de audit/verify. Configurar CI con lint, build, test y test:e2e.

Paso 25 - Revisión de seguridad. Aplicar el checklist OWASP ASVS de autenticación y gestión de sesiones antes de pasar a producción.


Extensiones futuras, fuera del alcance actual

MFA o TOTP como segundo factor.
SSO, OIDC o SAML como proveedor de identidad federado.
Verificación de email e invitaciones a la organización.
Restablecimiento de contraseña por email.
Jerarquía de roles con herencia de permisos.
Rate limiting distribuido con Redis para varias instancias.
Rotación automática de claves JWT con varios kid y revocación de kid.
Notificaciones de seguridad por inicio de sesión en un dispositivo nuevo o reutilización detectada.


Verificación global pendiente

Ejecutar npm run lint y npm run build sin errores tras cada fase.
Ejecutar npm test con los tests unitarios de todas las fases.
Ejecutar npm run test:e2e con el flujo completo sobre la base de datos de prueba en docker.
Probar manualmente con curl el registro, el login, el refresh, la reutilización, la revocación y la auditoría.
Mantener npm audit sin vulnerabilidades.


Comandos útiles

docker compose up -d para levantar PostgreSQL 16 en el puerto 5433 del host.
npm run keys:generate para generar las claves JWT RS256 en la carpeta secrets.
npm run start:dev para arrancar el servidor con recarga automática.
npm run migration:run para aplicar las migraciones pendientes.
npm run migration:generate con la ruta src/database/migrations y un nombre para generar una migración nueva.
npm run lint, npm run build, npm test y npm run test:e2e para calidad y pruebas.

