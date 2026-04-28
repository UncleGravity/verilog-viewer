{
  description = "Web viewer for Verilog/yosys netlists";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [
        "aarch64-darwin"
        "x86_64-linux"
        "aarch64-linux"
      ];
    in {
      packages = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in {
          default = pkgs.writeShellApplication {
            name = "verilog-viewer";
            runtimeInputs = [ pkgs.bun pkgs.yosys pkgs.netlistsvg ];
            text = ''
              SRC=${./.}
              CACHE="''${XDG_CACHE_HOME:-$HOME/.cache}/verilog-viewer"

              # Source tree lives in the read-only Nix store; bun needs a
              # writable working dir for node_modules. Re-sync the cache
              # whenever the lockfile changes.
              if [ ! -f "$CACHE/.stamp" ] || [ "$SRC/bun.lock" -nt "$CACHE/.stamp" ]; then
                rm -rf "$CACHE" && mkdir -p "$CACHE"
                cp -r "$SRC"/. "$CACHE"/ && chmod -R u+w "$CACHE"
                ( cd "$CACHE" && bun install --frozen-lockfile )
                touch "$CACHE/.stamp"
              fi

              # Run from cache, but resolve user --rtl globs against their CWD.
              INVOKE_CWD=$PWD
              cd "$CACHE"
              exec bun run index.ts --cwd "$INVOKE_CWD" "$@"
            '';
          };
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/verilog-viewer";
        };
      });

      devShells = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in {
          default = pkgs.mkShell {
            buildInputs = [ pkgs.bun pkgs.yosys pkgs.netlistsvg ];
          };
        }
      );
    };
}
