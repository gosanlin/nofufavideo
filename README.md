# Nofufa Video — v4 para GitHub Pages

## Publicar
1. Descomprime este ZIP y sube su contenido a la raíz de tu repositorio, manteniendo la carpeta `.github/workflows`.
2. En GitHub abre **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Sube los cambios a la rama `main`. También puedes iniciar **Actions → Publicar en GitHub Pages → Run workflow**.
4. El proceso instala las dependencias, genera la web estática y la publica. No subas el ZIP como un solo archivo.

El catálogo original `public/videos.json` está vacío. Para obtener tus vídeos, conserva/configura el secreto `LULU_API_KEY` en **Settings → Secrets and variables → Actions**, o proporciona el catálogo en `public/videos.json`. Nunca pegues una clave privada en el código o en el HTML. Se conserva el sistema de sincronización del archivo original.

## Cambios
- Eliminada la opción «Siguiente episodio automático»; las preferencias antiguas y las copias importadas tampoco pueden reactivarla.
- El paso entre episodios es manual, también al terminar un vídeo local.
- Reproductor embed: recarga, modo cine, apertura aparte, copia de enlace, Mi lista, marcado manual como visto y temporizador de cierre de 15/30/60 minutos.
- Pantalla completa y navegación manual anterior/siguiente conservadas.
- El temporizador cierra el reproductor; no pretende controlar la pausa interna de LuluStream.
- No se calcula progreso ni finalización del embed a partir del tiempo que está abierto: ese cálculo no podía distinguir una pausa de una reproducción.

## Límites del proveedor
El iframe pertenece a otro dominio. Sin una interfaz documentada del proveedor, la página no puede leer su tiempo, controlar pausa/volumen/calidad/subtítulos ni garantizar que acepte la posición de reanudación. Los botones propios del reproductor de LuluStream siguen disponibles. Los atajos de la página no actúan mientras el foco está dentro del iframe.

## Verificación
48 pruebas del sitio superadas; compilación estática correcta. Comprobados los controles con un iframe simulado, los datos guardados y la presentación móvil/ordenador. No se ha verificado la reproducción con un vídeo real de tu cuenta ni la publicación remota en tu repositorio.

## Desarrollo
`bun install`
`bun run build:pages`
`bunx vitest run src/tv`

La web utiliza rutas de recursos relativas y navegación con `#`, para funcionar tanto en un dominio propio como en una subcarpeta de GitHub Pages. El ZIP contiene código fuente; GitHub Actions genera automáticamente los archivos publicables, sin servidor.
