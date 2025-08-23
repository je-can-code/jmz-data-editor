# JMZ Data Editor (OS-agnostic)

This editor contains multiple "boards" that provide a GUI for manipulating the configuration data for the various
plugins I have developed. 

## Currently supported plugins
Only some of the plugins I've authored are supported with this editor as this is a still fairly new project.

- Skill Proficiency System (complete)
- Crafting (complete)
- Questopedia (complete)
- Enemies (base params and extra drops from my plugin)

## Preamble
If you run into issues on linux about `libwebkit2gtk` missing or something, review
[**this comment on github**](https://github.com/bambulab/BambuStudio/issues/3973#issuecomment-2085476683) to get your
system up and running.

## Running the app
To run the app there are a couple steps involved.

1) Globally install `bun` (used as an `npm` alternative here):
> https://bun.sh/docs/installation

1) Install the packages:
```bash
cd /app
bun i
```

1) Navigate back to the root and run the app:
```bash
cd ..
bun start
```

1) Set the "project path" at the `/data` directory of your project where all the configuration files are
derived from, and that is it!

> Later, properly OS-agnostic publishing 

---
