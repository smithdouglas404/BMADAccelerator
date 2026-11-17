-- One skill library: ECC skills switched on for every product.
ALTER TABLE "Preferences" ADD COLUMN "eccAllProducts" TEXT[] DEFAULT ARRAY[]::TEXT[];
