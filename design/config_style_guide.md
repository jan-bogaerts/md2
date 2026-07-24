---
internalId: 428a45fe-0925-4978-9638-9ea36719776f
---

# Config page style guide

## Purpose

Make config pages easy to scan and clearly editable. Each label, value, and description must read as one field, while related fields must read as one section.

## Problems to avoid

- Do not render labels, values, and descriptions as loose lines of text. Without a shared container, it is unclear which description belongs to which value.
- Do not render editable values as bare text. Editable controls need a consistent visual affordance.
- Do not use the same spacing between every line. Spacing inside a field must be tighter than spacing between fields.
- Do not underline section headings. An underline makes headings look like links.

## Field pattern

Use MUI's built-in field structure for editable text values. Put the label, value, and helper text in the same `TextField`:

```tsx
<TextField
    fullWidth
    helperText="Project root folder containing actions, history, and the working folder. Leave empty to use the repository root."
    label="Project folder"
    onChange={handleProjectFolderChange}
    value={projectFolder}
    variant="outlined"
/>
```

Use one `TextField` variant and size consistently across the config page. Prefer `outlined` for a crisp field boundary. Do not place field descriptions in a separate `Typography` below the control when MUI provides `helperText` or `FormHelperText`.

Apply the same structure to each editor type:

- Strings and numbers: `TextField` with `label` and `helperText`.
- Known values: `TextField select`, or `FormControl` with `InputLabel`, `Select`, and `FormHelperText`.
- Booleans: keep the semantic `Switch`, but group it with its description in a consistent field block using `FormControl` and `FormHelperText`.
- Sliders: keep the semantic `Slider`, but group its label, value, and description in the same field block.
- Structured editors: keep the dedicated editor and place its label, validation feedback, and description within one visible field block.
- Long templates and JSON: use a multiline `TextField` with an appropriate minimum height.

Use monospace only for literal content such as commands, placeholders, templates, and JSON:

```tsx
<TextField
    fullWidth
    helperText="Markdown inserted into new cards before the typed body."
    label="Card body template"
    minRows={6}
    multiline
    sx={{ '& textarea': { fontFamily: 'monospace' } }}
    value={cardBodyTemplate}
/>
```

## Sections and spacing

- Wrap the fields in `Stack spacing={3}`. Let each field component manage its internal label, input, and helper-text spacing.
- Place each section in `Paper variant="outlined"` with `sx={{ p: 3 }}`, or an equivalent `Card`, so the section forms a distinct surface.
- Use `Typography variant="h6"` for section headings without an underline.
- Optionally use `Typography variant="overline" color="text.secondary"` for a short section subtitle.
- Constrain the form content to `maxWidth: 720`. Very wide inputs are difficult to scan.

Example section:

```tsx
<Paper component="section" variant="outlined" sx={{ maxWidth: 720, p: 3 }}>
    <Stack spacing={3}>
        <Typography component="h3" variant="h6">
            Project
        </Typography>
        {fields}
    </Stack>
</Paper>
```

## Typography and color

- Use MUI's default helper-text styling so descriptions remain small and use `text.secondary`.
- Keep labels visually associated with their controls through `TextField` labels or `InputLabel`.
- Use monospace only where the content is literal, not for ordinary labels or descriptions.
- Render placeholders such as `{{commit}}` as inline `code` or small `Chip` elements when custom helper-text markup is needed.

## Optional theme defaults

If config fields remain consistent across the application, move repeated presentation props into the theme:

```ts
components: {
    MuiPaper: {
        styleOverrides: {
            root: { borderRadius: 10 },
        },
    },
    MuiTextField: {
        defaultProps: {
            fullWidth: true,
            size: 'medium',
            variant: 'outlined',
        },
    },
}
```

Add theme defaults only when they are intended for every use of the component. Otherwise, keep the config-specific styling in the config components.

## Implementation order

1. Integrate every field's label and description into its MUI control or field block.
2. Make selects and other typed editors visually consistent with text fields.
3. Add deliberate field spacing and a visible surface around each section.
4. Remove heading underlines and constrain the form width.
5. Add monospace treatment for literal values and placeholder styling.
6. Move stable, application-wide defaults into the theme if appropriate.

## Current implementation touchpoints

- `app/src/components/config/config_value_editor.tsx` owns the typed field rendering and helper-text placement.
- `app/src/components/config/config_section_layout.tsx` owns section headings, field spacing, and section boundaries.
- `app/src/components/config/config_page.tsx` owns the page width, navigation, and Save/Cancel actions.
- `app/src/services/config_entries.ts` owns field labels and descriptions.
