<?php

declare(strict_types=1);

header("Content-Type: application/json; charset=utf-8");

require_once __DIR__ . "/../conexion.php";

ensureSchema($conn);

if (($_SERVER["REQUEST_METHOD"] ?? "GET") === "OPTIONS") {
    http_response_code(204);
    exit;
}

if (isset($_GET["ping"])) {
    respond([
        "ok" => true,
        "message" => "API activa",
        "database" => "agenda_telefonica",
    ]);
}

$method = strtoupper($_SERVER["REQUEST_METHOD"] ?? "GET");
$contactId = isset($_GET["id"]) ? (int) $_GET["id"] : 0;

switch ($method) {
    case "GET":
        if ($contactId > 0) {
            $contact = fetchContactById($conn, $contactId);

            if ($contact === null) {
                respondError("El contacto solicitado no existe.", 404);
            }

            respond($contact);
        }

        respond(fetchAllContacts($conn));
        break;

    case "POST":
        $payload = readJsonPayload();
        $contact = createContact($conn, $payload);
        respond($contact, 201);
        break;

    case "PUT":
        if ($contactId <= 0) {
            respondError("Debes indicar un id valido para actualizar.", 422);
        }

        $payload = readJsonPayload();
        $contact = updateContact($conn, $contactId, $payload);
        respond($contact);
        break;

    case "PATCH":
        if ($contactId <= 0) {
            respondError("Debes indicar un id valido para editar.", 422);
        }

        $payload = readJsonPayload();
        $contact = updateFavorite($conn, $contactId, $payload);
        respond($contact);
        break;

    case "DELETE":
        if ($contactId <= 0) {
            respondError("Debes indicar un id valido para eliminar.", 422);
        }

        deleteContact($conn, $contactId);
        respond([
            "ok" => true,
            "message" => "Contacto eliminado correctamente.",
        ]);
        break;

    default:
        respondError("Metodo no permitido.", 405);
        break;
}

function fetchAllContacts(mysqli $conn): array
{
    $sql = <<<SQL
        SELECT
            id,
            nombre,
            telefono,
            COALESCE(telefono_secundario, '') AS telefono_secundario,
            COALESCE(email, '') AS email,
            COALESCE(empresa, '') AS empresa,
            COALESCE(categoria, 'Personal') AS categoria,
            COALESCE(cumpleanos, '') AS cumpleanos,
            COALESCE(direccion, '') AS direccion,
            COALESCE(notas, '') AS notas,
            favorito,
            fecha_creacion,
            fecha_actualizacion
        FROM contactos
        ORDER BY fecha_actualizacion DESC, id DESC
    SQL;

    $result = $conn->query($sql);

    if (!$result) {
        respondError("No se pudieron cargar los contactos.", 500);
    }

    $contacts = [];

    while ($row = $result->fetch_assoc()) {
        $contacts[] = mapContactRow($row);
    }

    return $contacts;
}

function fetchContactById(mysqli $conn, int $contactId): ?array
{
    $stmt = $conn->prepare(
        "SELECT id, nombre, telefono, COALESCE(telefono_secundario, '') AS telefono_secundario, COALESCE(email, '') AS email, COALESCE(empresa, '') AS empresa, COALESCE(categoria, 'Personal') AS categoria, COALESCE(cumpleanos, '') AS cumpleanos, COALESCE(direccion, '') AS direccion, COALESCE(notas, '') AS notas, favorito, fecha_creacion, fecha_actualizacion FROM contactos WHERE id = ? LIMIT 1"
    );

    if (!$stmt) {
        respondError("No se pudo preparar la consulta del contacto.", 500);
    }

    $stmt->bind_param("i", $contactId);

    if (!$stmt->execute()) {
        respondError("No se pudo buscar el contacto.", 500);
    }

    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    return $row ? mapContactRow($row) : null;
}

function createContact(mysqli $conn, array $payload): array
{
    $data = validateContactPayload($payload);
    $createdBy = resolveCreatorId($conn);

    $stmt = $conn->prepare(
        "INSERT INTO contactos (creado_por, nombre, telefono, telefono_secundario, email, empresa, categoria, cumpleanos, direccion, notas, favorito) VALUES (?, ?, ?, ?, ?, ?, ?, NULLIF(?, ''), ?, ?, ?)"
    );

    if (!$stmt) {
        respondError("No se pudo preparar el guardado del contacto.", 500);
    }

    $stmt->bind_param(
        "isssssssssi",
        $createdBy,
        $data["name"],
        $data["phone"],
        $data["secondaryPhone"],
        $data["email"],
        $data["company"],
        $data["category"],
        $data["birthday"],
        $data["address"],
        $data["notes"],
        $data["favorite"]
    );

    if (!$stmt->execute()) {
        handleStatementError($stmt, "No se pudo guardar el contacto.");
    }

    $contactId = (int) $stmt->insert_id;
    $stmt->close();

    $contact = fetchContactById($conn, $contactId);

    if ($contact === null) {
        respondError("El contacto se guardo, pero no se pudo devolver.", 500);
    }

    return $contact;
}

function updateContact(mysqli $conn, int $contactId, array $payload): array
{
    if (fetchContactById($conn, $contactId) === null) {
        respondError("El contacto que intentas editar no existe.", 404);
    }

    $data = validateContactPayload($payload);

    $stmt = $conn->prepare(
        "UPDATE contactos SET nombre = ?, telefono = ?, telefono_secundario = ?, email = ?, empresa = ?, categoria = ?, cumpleanos = NULLIF(?, ''), direccion = ?, notas = ?, favorito = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?"
    );

    if (!$stmt) {
        respondError("No se pudo preparar la actualizacion del contacto.", 500);
    }

    $stmt->bind_param(
        "sssssssssii",
        $data["name"],
        $data["phone"],
        $data["secondaryPhone"],
        $data["email"],
        $data["company"],
        $data["category"],
        $data["birthday"],
        $data["address"],
        $data["notes"],
        $data["favorite"],
        $contactId
    );

    if (!$stmt->execute()) {
        handleStatementError($stmt, "No se pudo actualizar el contacto.");
    }

    $stmt->close();

    $contact = fetchContactById($conn, $contactId);

    if ($contact === null) {
        respondError("No se pudo recuperar el contacto actualizado.", 500);
    }

    return $contact;
}

function updateFavorite(mysqli $conn, int $contactId, array $payload): array
{
    if (fetchContactById($conn, $contactId) === null) {
        respondError("El contacto que intentas editar no existe.", 404);
    }

    if (!array_key_exists("favorite", $payload)) {
        respondError("Debes indicar el estado favorito.", 422);
    }

    $favorite = !empty($payload["favorite"]) ? 1 : 0;

    $stmt = $conn->prepare(
        "UPDATE contactos SET favorito = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?"
    );

    if (!$stmt) {
        respondError("No se pudo preparar el cambio de favorito.", 500);
    }

    $stmt->bind_param("ii", $favorite, $contactId);

    if (!$stmt->execute()) {
        handleStatementError($stmt, "No se pudo actualizar el favorito.");
    }

    $stmt->close();

    $contact = fetchContactById($conn, $contactId);

    if ($contact === null) {
        respondError("No se pudo recuperar el contacto editado.", 500);
    }

    return $contact;
}

function deleteContact(mysqli $conn, int $contactId): void
{
    $stmt = $conn->prepare("DELETE FROM contactos WHERE id = ?");

    if (!$stmt) {
        respondError("No se pudo preparar la eliminacion.", 500);
    }

    $stmt->bind_param("i", $contactId);

    if (!$stmt->execute()) {
        handleStatementError($stmt, "No se pudo eliminar el contacto.");
    }

    if ($stmt->affected_rows < 1) {
        $stmt->close();
        respondError("El contacto que intentas borrar no existe.", 404);
    }

    $stmt->close();
}

function validateContactPayload(array $payload): array
{
    $name = normalizeText($payload["name"] ?? "", 120);
    $phone = normalizeText($payload["phone"] ?? "", 30);
    $secondaryPhone = normalizeText($payload["secondaryPhone"] ?? "", 30);
    $email = normalizeText($payload["email"] ?? "", 150);
    $company = normalizeText($payload["company"] ?? "", 120);
    $category = normalizeText($payload["category"] ?? "Personal", 60);
    $birthday = normalizeText($payload["birthday"] ?? "", 10);
    $address = normalizeText($payload["address"] ?? "", 180);
    $notes = normalizeText($payload["notes"] ?? "", 600);
    $favorite = !empty($payload["favorite"]) ? 1 : 0;

    if ($name === "") {
        respondError("El nombre es obligatorio.", 422);
    }

    if (!preg_match("/^[\\p{L}\\s.'-]+$/u", $name)) {
        respondError("El nombre solo puede llevar letras, espacios, puntos, apostrofes o guiones.", 422);
    }

    if ($phone === "") {
        respondError("El telefono principal es obligatorio.", 422);
    }

    if (!preg_match("/^[+0-9() -]{3,30}$/", $phone)) {
        respondError("El telefono principal solo puede llevar numeros y signos telefonicos validos.", 422);
    }

    if ($secondaryPhone !== "" && !preg_match("/^[+0-9() -]{3,30}$/", $secondaryPhone)) {
        respondError("El telefono alterno solo puede llevar numeros y signos telefonicos validos.", 422);
    }

    if ($email !== "" && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        respondError("El correo electronico no es valido.", 422);
    }

    if ($company !== "" && !preg_match("/^[\\p{L}\\s.'&-]+$/u", $company)) {
        respondError("La empresa solo puede llevar letras, espacios, apostrofes, ampersand o guiones.", 422);
    }

    if ($category === "") {
        $category = "Personal";
    }

    if (!preg_match("/^[\\p{L}\\s.'-]+$/u", $category)) {
        respondError("La categoria solo puede llevar texto.", 422);
    }

    if ($birthday !== "" && !isValidDate($birthday)) {
        respondError("La fecha de cumpleanos no tiene un formato valido.", 422);
    }

    return [
        "name" => $name,
        "phone" => $phone,
        "secondaryPhone" => $secondaryPhone,
        "email" => $email,
        "company" => $company,
        "category" => $category,
        "birthday" => $birthday,
        "address" => $address,
        "notes" => $notes,
        "favorite" => $favorite,
    ];
}

function normalizeText(mixed $value, int $maxLength): string
{
    $text = trim((string) $value);

    if (textLength($text) > $maxLength) {
        respondError("Uno de los campos supera el largo permitido.", 422);
    }

    return $text;
}

function textLength(string $text): int
{
    return function_exists("mb_strlen") ? mb_strlen($text) : strlen($text);
}

function isValidDate(string $value): bool
{
    $date = DateTime::createFromFormat("Y-m-d", $value);

    return $date instanceof DateTime && $date->format("Y-m-d") === $value;
}

function mapContactRow(array $row): array
{
    return [
        "id" => (string) $row["id"],
        "name" => (string) $row["nombre"],
        "phone" => (string) $row["telefono"],
        "secondaryPhone" => (string) ($row["telefono_secundario"] ?? ""),
        "email" => (string) ($row["email"] ?? ""),
        "company" => (string) ($row["empresa"] ?? ""),
        "category" => (string) ($row["categoria"] ?? "Personal"),
        "birthday" => (string) ($row["cumpleanos"] ?? ""),
        "address" => (string) ($row["direccion"] ?? ""),
        "notes" => (string) ($row["notas"] ?? ""),
        "favorite" => ((int) ($row["favorito"] ?? 0)) === 1,
        "createdAt" => toIsoDateTime($row["fecha_creacion"] ?? null),
        "updatedAt" => toIsoDateTime($row["fecha_actualizacion"] ?? null),
    ];
}

function toIsoDateTime(?string $value): string
{
    if ($value === null || $value === "") {
        return "";
    }

    $timestamp = strtotime($value);

    if ($timestamp === false) {
        return $value;
    }

    return date("c", $timestamp);
}

function readJsonPayload(): array
{
    $rawPayload = file_get_contents("php://input");

    if ($rawPayload === false || trim($rawPayload) === "") {
        return [];
    }

    $payload = json_decode($rawPayload, true);

    if (!is_array($payload)) {
        respondError("El cuerpo de la peticion no tiene JSON valido.", 400);
    }

    return $payload;
}

function respond(array $payload, int $statusCode = 200): void
{
    global $conn;

    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($conn instanceof mysqli) {
        $conn->close();
    }

    exit;
}

function respondError(string $message, int $statusCode = 400): void
{
    respond([
        "error" => $message,
    ], $statusCode);
}

function handleStatementError(mysqli_stmt $stmt, string $fallbackMessage): void
{
    $errorCode = (int) $stmt->errno;
    $stmt->close();

    if ($errorCode === 1062) {
        respondError("Ya existe un contacto con ese telefono o correo.", 409);
    }

    respondError($fallbackMessage, 500);
}

function resolveCreatorId(mysqli $conn): int
{
    $result = $conn->query("SELECT id FROM usuarios WHERE cuenta = 'agenda-admin' LIMIT 1");

    if (!$result) {
        return 1;
    }

    $row = $result->fetch_assoc();

    return isset($row["id"]) ? (int) $row["id"] : 1;
}

function ensureSchema(mysqli $conn): void
{
    $conn->query(
        "CREATE TABLE IF NOT EXISTS usuarios (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            cuenta VARCHAR(30) NOT NULL UNIQUE,
            nombre VARCHAR(120) NOT NULL,
            usuario VARCHAR(80) NOT NULL UNIQUE,
            correo VARCHAR(150) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            proveedor ENUM('local', 'google-demo', 'system') NOT NULL DEFAULT 'local',
            bio VARCHAR(255) NULL,
            foto_url VARCHAR(255) NULL,
            activo TINYINT(1) NOT NULL DEFAULT 1,
            creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish2_ci"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS contactos (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            creado_por BIGINT UNSIGNED NULL,
            nombre VARCHAR(120) NOT NULL,
            telefono VARCHAR(30) NOT NULL UNIQUE,
            telefono_secundario VARCHAR(30) NULL,
            email VARCHAR(150) NULL,
            empresa VARCHAR(120) NULL,
            categoria VARCHAR(60) NOT NULL DEFAULT 'Personal',
            cumpleanos DATE NULL,
            direccion VARCHAR(180) NULL,
            notas VARCHAR(600) NULL,
            favorito TINYINT(1) NOT NULL DEFAULT 0,
            activo TINYINT(1) NOT NULL DEFAULT 1,
            fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_contactos_nombre (nombre),
            INDEX idx_contactos_categoria (categoria),
            INDEX idx_contactos_favorito (favorito),
            INDEX idx_contactos_actualizacion (fecha_actualizacion),
            CONSTRAINT fk_contactos_creado_por
                FOREIGN KEY (creado_por) REFERENCES usuarios(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish2_ci"
    );

    ensureColumnExists($conn, "contactos", "telefono_secundario", "ALTER TABLE contactos ADD COLUMN telefono_secundario VARCHAR(30) NULL AFTER telefono");
    ensureColumnExists($conn, "contactos", "cumpleanos", "ALTER TABLE contactos ADD COLUMN cumpleanos DATE NULL AFTER categoria");

    $conn->query(
        "CREATE TABLE IF NOT EXISTS contacto_comentarios (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            contacto_id BIGINT UNSIGNED NOT NULL,
            usuario_id BIGINT UNSIGNED NULL,
            comentario VARCHAR(255) NOT NULL,
            creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_contacto_comentarios_contacto (contacto_id, creado_en),
            CONSTRAINT fk_contacto_comentarios_contacto
                FOREIGN KEY (contacto_id) REFERENCES contactos(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE,
            CONSTRAINT fk_contacto_comentarios_usuario
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
                ON DELETE SET NULL
                ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish2_ci"
    );

    $conn->query(
        "INSERT INTO usuarios (cuenta, nombre, usuario, correo, password_hash, proveedor, bio)
        VALUES
            ('agenda-admin', 'Agenda Admin', 'agendaadmin', 'admin@agenda.local', 'sin-login', 'system', 'Administrador de ejemplo'),
            ('rosa-bot', 'Rosa Bot', 'rosabot', 'rosa@agenda.local', 'sin-login', 'system', 'Bot de ayuda visual')
        ON DUPLICATE KEY UPDATE
            nombre = VALUES(nombre),
            bio = VALUES(bio),
            actualizado_en = CURRENT_TIMESTAMP"
    );
}

function ensureColumnExists(mysqli $conn, string $table, string $column, string $alterSql): void
{
    $safeTable = str_replace("`", "``", $table);
    $safeColumn = str_replace("`", "``", $column);
    $result = $conn->query("SHOW COLUMNS FROM `{$safeTable}` LIKE '{$safeColumn}'");

    if ($result instanceof mysqli_result && $result->num_rows > 0) {
        return;
    }

    $conn->query($alterSql);
}
