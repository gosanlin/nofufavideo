# Nofufa Video

Web estática lista para **GitHub Pages**.

## Publicar

1. Sube el contenido de este zip a la rama `main` de un repositorio de GitHub.
2. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
3. (Opcional) **Settings → Secrets and variables → Actions → New repository secret**:
   `LULU_API_KEY` con tu clave de LuluStream para descargar el catálogo automáticamente.
4. Cada push a `main` publica la web. El catálogo se refresca solo cada 15 minutos.

## Local

```bash
npm install
npm run dev     # desarrollo
npm run build   # genera dist/
```

## Atajos del reproductor

`F` pantalla completa · `N` siguiente episodio · `B` episodio anterior · `Esc` salir
