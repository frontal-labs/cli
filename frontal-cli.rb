# Documentation: https://docs.brew.sh/Formula-Cookbook
#                https://rubydoc.brew.sh/Formula
# PLEASE REMOVE ALL GENERATED COMMENTS BEFORE SUBMITTING YOUR PULL REQUEST!

class FrontalCli < Formula
  desc "Frontal platform CLI"
  homepage "https://github.com/frontal-labs/cli"
  url "https://github.com/frontal-labs/cli.git",
    tag:      "v0.1.0",
    revision: "HEAD"
  license "Apache-2.0"
  head "https://github.com/frontal-labs/cli.git", branch: "main"

  depends_on "node" => :recommended
  depends_on "bun" => :recommended

  def install
    # Try to use system bun if available, otherwise install via npm
    if which("bun")
      system "bun", "install", "--frozen-lockfile"
      system "bun", "run", "build"
    else
      # Fallback to npm/node
      system "npm", "install"
      system "npm", "run", "build"
    end
    
    # The bundle imports its runtime dependencies from node_modules, so keep
    # the whole tree in libexec and expose the entrypoint as `frontal`.
    libexec.install "dist", "node_modules", "package.json"
    bin.install_symlink libexec/"dist/index.js" => "frontal"
    chmod 0755, libexec/"dist/index.js"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/frontal --version")
    assert_match "frontal init", shell_output("#{bin}/frontal --help")
  end
end
