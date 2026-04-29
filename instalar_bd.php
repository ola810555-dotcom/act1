<?php

declare(strict_types=1);

require_once __DIR__ . "/conexion.php";

$sqlFile = __DIR__ . "/agenda_telefonica.sql";
$sql = file_get_contents($sqlFile);

if ($sql === false) {
    http_response_code(500);
    die("No se pudo leer agenda_telefonica.sql");
}

if (!$conn->multi_query($sql)) {
    http_response_code(500);
    die("No se pudo instalar la base de datos: " . $conn->error);
}

do {
    if ($result = $conn->store_result()) {
        $result->free();
    }
} while ($conn->more_results() && $conn->next_result());

if ($conn->error) {
    http_response_code(500);
    die("La instalacion termino con error: " . $conn->error);
}

echo "Base de datos agenda_telefonica instalada correctamente";

$conn->close();
?>
