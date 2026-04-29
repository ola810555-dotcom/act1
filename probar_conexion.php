<?php

$Servidor = "localhost";
$Usuario = "root";
$password = "";
$BaseDeDatos = "bd_usuarios";

//crear conexion
$conn = new mysqli($Servidor, $Usuario, $password, $BaseDeDatos);

//verificar conexion
if ($conn->connect_error) {
    die("Conexion fallida: " . $conn->connect_error);
}

echo "Conexion exitosa";

//cerrar conexion
$conn->close();
?>
