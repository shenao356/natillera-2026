# 🌟 Natillera 2026 - Sistema Inteligente de Ahorro y Créditos

Aplicación web moderna, colorida e interactiva en la nube para la gestión completa de la **Natillera 2026** (Ahorros quincenales, Préstamos/Créditos, Liquidaciones con intereses congelados y Emisión de Comprobantes Oficiales para WhatsApp).

Desarrollada para el Administrador **Santiago Henao** y desplegable 100% gratis en **GitHub Pages**.

---

## 🚀 Características Principales

### 📱 1. Envío de Comprobantes por WhatsApp
* **Tarjeta Digital HD (Estilo Neobanco / Nequi / Bancolombia)**: Genera una tarjeta gráfica de alta resolución con folio, código de verificación, valores discriminados y sello verificado.
* **Descarga como Imagen (PNG)**: Botón de un solo clic para guardar la imagen y compartirla en estados o chats de WhatsApp.
* **Mensajería Directa**: Botón para abrir WhatsApp con un mensaje pre-redactado con emojis, negritas y el resumen exacto de la transacción.

### 🐷 2. Control de Ahorros Quincenales (13 Socios)
* Tarjetas individuales para cada socio (*Adiela Vargas, Paola Valencia, Ana María López, Caro Ríos, Joha Díaz, Wilson Álvarez, Eliana Sánchez, Alicia Villa, Andrés Castro, Fernando Vargas, Jhonatan Salas, Jorge Gaviria, María E. Castañeda*).
* Medidor visual de progreso hacia la meta individual ($960.000) y global ($12.480.000).
* Matriz Quincenal interactiva (Q01 a Q24) con edición rápida de aportes y formas de pago (Transferencia, Nequi, Bancolombia, Adelantada, Efectivo).

### 💳 3. Control de Créditos y Liquidación Automática
* Cálculo de intereses en tiempo real según los días transcurridos desde el desembolso a la fecha actual (`=HOY()`).
* **Congelamiento de Intereses**: Permite liquidar el crédito a la fecha de pago final para no seguir acumulando cobros diarios.
* **Abonos Inteligentes**: Distribución automática que primero cubre los intereses acumulados y el saldo restante amortiza capital.
* Alerta de semáforo: Vigente (Azul), En Mora >30 días (Rojo), Pagado / Paz y Salvo (Verde con animación de confeti).

### 👥 4. Directorio de Socios & Estados de Cuenta
* Guarda y edita los números de WhatsApp de cada participante.
* Botón de 1 clic para enviar el **Estado de Cuenta Consolidado** por WhatsApp.

### 📊 5. Tablero General (Dashboard)
* KPIs en vivo: Total Ahorrado, Capital en la Calle, Intereses Ganados, Total Abonos Recaudados.
* Gráficos interactivos con Chart.js (recaudación quincenal y distribución de cartera).

### ☁️ 6. Respaldo y Compatibilidad con Excel
* **Exportar a Excel**: Genera un archivo `.xlsx` actualizado con 3 hojas de cálculo formateadas.
* **Copia de Seguridad JSON**: Descarga y restaura respaldos completos en cualquier momento.
* **Restablecer de Fábrica**: Permite volver al estado original de tus dos archivos Excel si lo deseas.

---

## 🛠️ Cómo Publicar en tu GitHub (`shenao356`) y Activar en la Nube

### Paso 1: Crear el repositorio en GitHub
1. Entra a [github.com/new](https://github.com/new) con tu cuenta `shenao356`.
2. En **Repository name**, escribe: `natillera-2026`.
3. Selecciona **Public** (Público) para que GitHub Pages sea 100% gratuito.
4. Deja las casillas de README desmarcadas y haz clic en **Create repository**.

### Paso 2: Subir el proyecto desde tu terminal
Abre una terminal PowerShell en esta carpeta y ejecuta:
```bash
cd "C:\Users\shena\natillera-2026"
git init
git add .
git commit -m "Natillera 2026 - Aplicacion Web Completa"
git branch -M main
git remote add origin https://github.com/shenao356/natillera-2026.git
git push -u origin main
```

### Paso 3: Activar GitHub Pages (1 Clic)
1. En tu repositorio en GitHub (`https://github.com/shenao356/natillera-2026`), ve a la pestaña **Settings** (Configuración).
2. En el menú de la izquierda, entra a **Pages**.
3. En **Branch**, selecciona `main` y la carpeta `/(root)`.
4. Haz clic en **Save** (Guardar).
5. En 1 minuto tu aplicación estará disponible en la nube en:
   👉 **`https://shenao356.github.io/natillera-2026/`**

---

## 💻 Uso Local en tu Computador
Puedes abrir directamente el archivo `index.html` en Google Chrome, Edge o cualquier navegador con doble clic.

O si prefieres un servidor local:
```bash
python -m http.server 8000
```
Y abre en tu navegador: `http://localhost:8000`

---
*Natillera 2026 • Administrador: Santiago Henao*
