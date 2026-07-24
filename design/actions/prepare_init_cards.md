---
internalId: 31b5184e-e093-4f92-b6f4-7b2d871c922c
---

read all the markdown files that describe this project's initial architecture found in `design\architecture\initial description` and prepare a list of feature descriptions and jobs that can be used to implement the architecture. 
we need the job or feature description's title, a description of 1 or 2 sentences and a reference to the markdown files that have more info. 
For each feature, create a markdown file and save it at `design\feature_descriptions`. Use the feature title as the filename. (.md extension)
In the markdown file, add the following:
```
---
id: F-0XX
title: XXX
status: design
owner: JB
affects:
policy:
  checkLinting: true
  requireTests: true
---

## Goal
XXX

## see also
- xxxx

```
- for id: replace XX with feature description count `F` for feature, `J` for jobs
- title: the title of the feature
- goal: a short description
- see also: markdown files that contains more info
- the rest of the text is static text.
No need for more info, we will flesh out each individual feature later on.

Example job:
- title: initialize.md
- description: create all folders and sub projects, install packages
- see also: `design\architecture\initial description\components.md`

Example feature:
- title: actions
- description:....
