# Image sources

The current header uses `images/octopus-favicon-16.png`, the original 16×16
transparent Octopus Energy favicon supplied by the user:

https://static.octopuscdn.com/favicons/favicon-16x16.png?v=20210127

Downloaded on 8 November 2026 and bundled unchanged, at native size. The larger
`images/octopus-favicon-32.png` is retained as a reference but is not bundled:

https://static.octopuscdn.com/favicons/favicon-32x32.png?v=20210127

The SDK converts the selected bitmap to the target display format. These images
belong to their original owner; no ownership or license is asserted here.

The original 16×16 favicon is also declared as OCTOPUS_MENU_ICON for the watch
launcher (menuIcon:true, within the 25×25 maximum). OCTOPUS_LOGO remains its own
resource for the in-app header. Phone/Appstore icons and cover are separate
original SVG/PNG artwork in ../store/assets/, not embedded Appstore metadata.
