rootProject.name = "greendms-salesman"
include(":app")
include(":api-client")
project(":api-client").projectDir = file("api-client")
