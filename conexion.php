<?php

$Servidor = "localhost";
$Usuario = "root";
$password = "";
$BaseDeDatos = "agenda_telefonica";

// Crear conexion al servidor
$conn = new mysqli($Servidor, $Usuario, $password);

// Verificar conexion
if ($conn->connect_error) {
    http_response_code(500);
    die("Conexion fallida: " . $conn->connect_error);
}

$conn->set_charset("utf8mb4");

$databaseName = str_replace("`", "``", $BaseDeDatos);

if (!$conn->query("CREATE DATABASE IF NOT EXISTS `{$databaseName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish2_ci")) {
    http_response_code(500);
    die("No se pudo crear la base de datos: " . $conn->error);
}

if (!$conn->select_db($BaseDeDatos)) {
    http_response_code(500);
    die("No se pudo seleccionar la base de datos: " . $conn->error);
}
