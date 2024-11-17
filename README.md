# JMZ Data Editor (OS-agnostic)

This editor contains multiple "boards" that provide a GUI for manipulating the configuration data for the various
plugins I have developed. 

## Currently supported plugins
Only some of the plugins I've authored are supported with this editor as this is a still fairly new project.

- Skill Proficiency System (complete)
- Crafting (partial)

## Running the app
To run the app there are a couple steps involved.

1) Install the packages:
```bash
cd /react-src
npm i
```

2) Navigate back to the root and run the app:
```bash
cd ..
npm start
```

3) Set the "project path" at the `/data` directory of your project where all the configuration files are
derived from, and that is it!

> Later, properly OS-agnostic publishing 