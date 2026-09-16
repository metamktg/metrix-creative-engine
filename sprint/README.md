# Run a sprint

Three steps. You type one thing.

## 1. Setup, once per machine

**Windows**

```
powershell -ExecutionPolicy Bypass -File sprint\setup.ps1
```

**macOS / Linux**

```
bash sprint/setup.sh
```

It asks for your Kie key if the terminal does not already have one (it is not
echoed and this script does not store it anywhere but your own environment),
installs the skills, makes the folders, and checks your balance. Re-run it
after a `git pull` to refresh the skills.

## 2. Drop the files in

```
sprint/briefs/     the .json from Metrix
sprint/refs/       product photos, packaging, logo
```

## 3. Go

Start Claude Code in this repo and paste the contents of **`sprint/GO.txt`**.

That is the whole interaction. It stops once, to show you two rendered cells
before it spends the rest, and then it runs to the end and reports.

## Afterwards

```
node skills/metrix-ad-creative/scripts/kie.mjs ledger
```

Every asset should already be in `sprint/out/`. Anything that shows only a URL
expires in about 24 hours.
