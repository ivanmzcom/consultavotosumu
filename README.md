# Recuento UM 2026

Aplicación web para consultar el recuento de las elecciones de la Universidad de Murcia 2026 a partir del endpoint:

`https://www.um.es/ws-siu/elecciones/elecciones_2026_1v.php`

## Desarrollo

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- API proxy local: `http://localhost:3001/api/elections`

## Producción

```bash
npm run build
npm start
```

El servidor Node sirve `dist/` y expone el proxy `/api/elections`.

## GitHub Pages

La build para GitHub Pages usa la base `/consultavotosumu/` y en producción consulta la API de la UM directamente, sin proxy local.

El despliegue automático queda configurado con GitHub Actions en:

`/.github/workflows/deploy.yml`
