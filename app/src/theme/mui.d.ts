import '@mui/material/styles'

interface CustomPalette {
    borderHover: string
    borderStrong: string
    chartPalette: string[]
    colHead: string
    primaryBg: string
    text3: string
    text4: string
    track: string
}

declare module '@mui/material/styles' {
    interface Palette {
        custom: CustomPalette
    }

    interface PaletteOptions {
        custom?: CustomPalette
    }
}
