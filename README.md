# Impact Global Agency - sitio web

Sitio y portal de Impact Global Agency, agencia de oportunidades deportivas, académicas y culturales para estudiar en Estados Unidos y otros países.

## Estructura

- `index.html`: presentación, servicios, información y requisitos, proceso, equipo, evaluación, preguntas frecuentes y contacto.
- `assets/impact-i18n.js`: traducciones de formularios y portal en español, inglés, francés e italiano.
- `assets/landing-ui.js`: etiquetas del formulario y medidas del encabezado fijo.
- `portal/index.html`, `portal/portal.css`, `portal/portal.js`: registro, acceso y paneles por rol.
- `assets/`: logos e iconos de marca. Se respetan mayúsculas y nombres de archivos en las URLs.
- `robots.txt` y `sitemap.xml`: SEO de la página pública. El portal usa `noindex`.

## Como iniciarlo

```bash
npm start
```

Después entrar a `http://localhost:8000` y `http://localhost:8000/portal`.

## Portal de demostración

La pantalla pública ofrece jugador/estudiante y entrenador. El rol de administración se determina por la cuenta, sin un selector público. Antes de ingresar no se muestran los paneles. Cerrar sesión vuelve al acceso; recargar conserva la sesión en la misma pestaña.

| Cuenta de prueba | Contraseña | Vista |
| --- | --- | --- |
| `jugador@impactglobalagency.com` | `impactdemo` | Perfil del estudiante |
| `coach@impactglobalagency.com` | `impactdemo` | Candidatos, guardados y perfil del entrenador |
| `admin@impactglobalagency.com` | `impactdemo` | Perfiles, edición, videos, responsable y estado |

Estos correos son identificadores de prueba, no casillas de contacto. También se pueden crear cuentas de jugador o entrenador desde el formulario. Las contraseñas de esas cuentas se derivan con PBKDF2 y un salt individual.

Los perfiles, cuentas y favoritos se guardan en `localStorage` bajo `impactPortalV1`. Los videos MP4/WebM de hasta 50 MB se guardan en `IndexedDB` (`impactPortalMedia`), sin subir archivos a un servidor. Borrar los datos del navegador elimina la demo guardada. Los perfiles iniciales están marcados como ejemplos.

Los jugadores pueden guardar borradores, publicar en el buscador de la demo, retirar la publicación, cargar highlights, abrir una vista previa y descargar una página HTML. La ruta `/portal?perfil=ID` muestra un perfil publicado disponible en el mismo navegador. Esa vista y la descarga excluyen el correo y el presupuesto. No se presentan subdominios ficticios como si estuvieran activos.

Los entrenadores pueden filtrar candidatos, guardar favoritos y exportar la lista. Administración puede crear y editar perfiles, cargar videos o links, asignar a Genaro Fessia o Agustín Loprestti y registrar el estado.

Esta es una demo local: el acceso por roles en el frontend no reemplaza autenticación y autorización en un servidor. Para datos reales y perfiles compartidos entre dispositivos, conectar Supabase Auth, tablas con políticas RLS y Storage. Los subdominios individuales requieren además DNS y rutas del hosting. La demo actual no ofrece esa sincronización.

## Publicación y rutas

Vercel publica desde `main`. `vercel.json` incluye el sitio estático completo y resuelve `/portal` hacia `portal/index.html`. Los estilos, scripts y logos del portal usan rutas desde la raíz para funcionar tanto en `/portal` como en `/portal/`.

Para Cloudflare Workers, `wrangler.jsonc` configura los archivos estáticos con el binding `ASSETS`; `_worker.js` resuelve la ruta del portal. Publicar el repositorio actualizado con la integración Git existente o ejecutar `npx wrangler deploy` desde una sesión autorizada de Cloudflare. El dominio debe estar asociado al proyecto que sirve estos archivos.

Si usás Cloudflare Pages, la carpeta de salida del sitio estático es la raíz, sin compilación de frontend. `_redirects` y `_worker.js` incluyen las rutas del portal. No subas solamente `index.html`: también deben publicarse `assets/` y `portal/`.

Si Vercel muestra la actualización y el dominio propio muestra una versión anterior, revisar en Cloudflare qué proyecto o Worker atiende ese dominio. Las reglas personalizadas de caché pueden servir archivos anteriores; Cloudflare recomienda evitar caché adicional sobre Pages. Ver [rutas y caché en Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) y [rutas HTML en Workers](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).

## Verificación

```bash
npm install
npx playwright install chromium
npm test
```

Las pruebas levantan un servidor en un puerto disponible y comprueban rutas y logos, idiomas, consulta por WhatsApp, acceso por rol, registro, perfiles, video reproducible, filtros, favoritos, administración y pantallas de 320 a 1920 px. Las capturas se guardan en `test-results/` y no se versionan. `PLAYWRIGHT_MODULE_PATH` permite usar un runtime de Playwright ya instalado.

## Pendientes

- Definir correo corporativo `@impactglobalagency.com`.
- Instagram ya está enlazado a `impact_global_agency`. No se publican enlaces vacíos a otras redes.
- Sumar testimonios en video cuando haya casos listos.
- Conectar autenticación, base de datos y archivos compartidos con Supabase.
