# Documentation: https://docs.brew.sh/Formula-Cookbook
#                https://rubydoc.brew.sh/Formula
# PLEASE REMOVE ALL GENERATED COMMENTS BEFORE SUBMITTING YOUR PULL REQUEST!

class Frontal < Formula
  desc "Frontal CLI"
  homepage "https://github.com/frontal-labs/cli"
  url "https://github.com/frontal-labs/cli.git",
    tag:      "v0.1.0",
    revision: "HEAD"
  license "MIT"
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

    # Install the binary with proper shebang
    bin.install "dist/bin/frontal.js" => "frontal"

    # Ensure executable permissions
    chmod 0755, bin/"frontal"
  end

  test do
    assert_match "Frontal CLI", shell_output("#{bin}/frontal --version")
    assert_match "Frontal CLI", shell_output("#{bin}/frontal --help")
  end
end
