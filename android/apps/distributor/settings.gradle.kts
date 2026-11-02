rootProject.name = "greendms-distributor"
include(":app")
include(":api-client")
project(":api-client").projectDir = file("api-client")
