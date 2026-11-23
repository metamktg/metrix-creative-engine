# Brand kits

Brand kits are client material, so none is committed here. This repository is
public, and a plugin install copies it to every user.

`brand-kit-builder` writes each kit to `brand-kits/<account>/` inside your
assets folder: the plugin's assets folder option, or `METRIX_ASSETS_DIR`. With
neither set it writes under the folder you work in. Git ignores everything in
this folder except this file, and `npm run check:plugin` fails if a kit is ever
tracked.
