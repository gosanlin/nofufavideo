# Nofufa Video — web para GitHub Pages + Luluvido

Interfaz, carpetas y funciones de Nofufa Video, con el reproductor de archivos locales sustituido por los streams de **Luluvido/LuluStream** (integración de LuluFlix).

## Publicar en GitHub Pages
1. Crea un repositorio público y sube **todo el contenido** de esta carpeta (`package.json` en la raíz).
2. **Settings → Secrets and variables → Actions → New repository secret**: `LULU_API_KEY` = tu clave de Luluvido.
3. **Settings → Pages → Source: GitHub Actions**.
4. Pestaña **Actions → "Publicar en GitHub Pages" → Run workflow**.
5. Web en `https://TU-USUARIO.github.io/NOMBRE-REPO/`. El catálogo se actualiza solo cada hora.

Sin clave: edita `public/videos.json` a mano:
```json
[{ "title": "Mi serie S01E01", "code": "tl7fy2x0gpsz", "thumb": "" }]
```
`code` es lo que va detrás de `/e/` en `https://luluvido.com/e/CODIGO`. Títulos con `S01E01`, `1x01` o `Capítulo 1` se agrupan como series; el resto son películas. Campo opcional `folder` para forzar la serie.

## Local
    npm install
    npm run dev        # desarrollo
    npm run build            # genera dist/ (estático)

Opcional: `VITE_LULU_API_KEY` en la build activa la lectura en directo de la API (la clave queda visible).
