# Public Root Artifact Policy

`deploy/public-root/` is an ignored local artifact directory. It is not source of
truth for the Queless public marketing website and must not be copied to
production `/`.

Production deployment targets are intentionally separate:

- Public marketing website `/`: build from the `line-up-barber-website`
  repository.
- Queless web app `/app/`: build from this app repository's frontend.
- Backend `/api/`: deploy from this app repository's backend.
- Android downloads `/downloads/`: publish only approved signed APK artifacts.

Before deploying any public website build, verify the source repository, branch,
commit, and target directory. A backend or `/app/` deployment must not replace
the public root website, and a public website deployment must not replace
`/app/`, `/downloads/`, or backend files.
