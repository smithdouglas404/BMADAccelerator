# The ECC source the Studio imports: one setting, read by scripts/fetch-vendor.sh at every build.
# Point ECC_REPO at our own copy of ECC and ECC_SHA at the commit to pin; the Skills screen's ECC list
# and the version it shows are rebuilt from whatever this names (scripts/ecc-catalog.mjs).
# Today: the open-source ECC, main as of Nov 19 2026 (VERSION 2.2.3, MIT).
ECC_REPO="${ECC_REPO:-https://github.com/affaan-m/everything-claude-code}"
ECC_SHA="${ECC_SHA:-4adeee6732a12d1540f49a4d50a38ce8c97f9a53}"
