package cmd

import (
	"fmt"
	"log"
	"os"

	"github.com/spf13/cobra"
	"gopkg.in/ini.v1"
)

func init() {
	rootCmd.AddCommand(saveCmd)
}

var saveCmd = &cobra.Command{
	Use: "save",
	Run: func(cmd *cobra.Command, args []string) {
		creds := getCacheFile()
		UpdateIni(creds)
	},
}

func UpdateIni(creds CacheFile) {
	homedir, err := os.UserHomeDir()
	if err != nil {
		log.Fatal(err)
	}
	credspath := fmt.Sprintf("%s/.aws/credentials", homedir)
	cfg, err := ini.Load(credspath)
	if err != nil {
		log.Fatal(err)
	}
	d := cfg.Section("default")
	d.Key("aws_access_key_id").SetValue(creds.Credentials.AccessKeyId)
	d.Key("aws_secret_access_key").SetValue(creds.Credentials.SecretAccessKey)
	d.Key("aws_session_token").SetValue(creds.Credentials.SessionToken)
	d.Key("aws_security_token").SetValue(creds.Credentials.SessionToken)
	d.Key("aws_session_expiration").SetValue(creds.Credentials.Expiration)
	cfg.SaveTo(credspath)
}
