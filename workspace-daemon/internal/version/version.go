package version

// Version is set at build time
var Version = "dev"

// GetVersion returns the current version
func GetVersion() string {
	return Version
}
