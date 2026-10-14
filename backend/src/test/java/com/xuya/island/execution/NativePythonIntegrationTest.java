package com.xuya.island.execution;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.xuya.island.account.AccountRequests;
import com.xuya.island.account.AccountScope;
import com.xuya.island.account.AccountService;
import com.xuya.island.common.BusinessException;
import com.xuya.island.config.DatabaseConfiguration;
import com.xuya.island.config.XuyaProperties;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 真实主机Python、Windows Job和临时数据；不用模型或付费接口。 */
class NativePythonIntegrationTest {
    @TempDir Path data;
    private NativePythonService python;
    private PythonEnvironmentService environments;
    private String first;
    private String second;
    private AccountService accounts;
    private Path testExecutable;

    @BeforeEach
    void setup() {
        Path executable =
                Path.of(
                        System.getProperty(
                                "xuya.test.python",
                                System.getenv()
                                        .getOrDefault(
                                                "XUYA_TEST_PYTHON",
                                                "C:/Users/101202303018/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe")));
        assertTrue(Files.isRegularFile(executable), "请用-Dxuya.test.python提供测试专用解释器");
        testExecutable = executable;
        var source = DatabaseConfiguration.openDatabase(data.resolve("db/xuya.db"));
        var jdbc = JdbcClient.create(source);
        accounts =
                new AccountService(
                        jdbc, new TransactionTemplate(new DataSourceTransactionManager(source)));
        first = accounts.setup(new AccountRequests.Setup("admin", "管理员", "admin-password"));
        second =
                accounts.createUser(
                        new AccountRequests.SaveUser(
                                "learner", "孩子", "learner-password", true, List.of("learner")),
                        false);
        environments = new PythonEnvironmentService(accounts);
        environments.select(executable.toString());
        python =
                new NativePythonService(
                        environments,
                        accounts,
                        jdbc,
                        new XuyaProperties(
                                data,
                                0,
                                List.of(),
                                new XuyaProperties.ModelProperties("", "", "", "")),
                        new com.xuya.island.execution.world.LocalPythonLauncher());
        AccountScope.set(first);
    }

    @AfterEach
    void close() {
        if (python != null) python.close();
        AccountScope.clear();
    }

    @Test
    void runsChineseInputDrawingsAndFilesWithRealInterpreter() throws Exception {
        String code =
                "from xuya.draw import circle\nfrom xuya.stage import cup,pour,drink,say\nname=input('你的名字：')\nprint('你好，'+name)\ncircle(10,20,3)\ncup()\npour(2)\ndrink('奶茶',1)\nsay('欢迎')\nopen('故事.txt','w',encoding='utf-8').write(name)";
        var created = start(code, "live", List.of());
        String id = created.get("id").toString();
        var waiting = await(id, "waiting");
        assertEquals(1, waiting.get("inputId"));
        AccountScope.set(second);
        assertThrows(BusinessException.class, () -> python.snapshot(id));
        assertThrows(BusinessException.class, () -> python.stop(id));
        AccountScope.set(first);
        python.input(id, new NativePythonService.Input(1, "小芽", false));
        var result = result(await(id, "completed"));
        assertEquals("success", result.get("status"));
        assertTrue(result.get("output").toString().contains("你好，小芽"));
        assertEquals(1, ((List<?>) result.get("drawings")).size());
        assertEquals(4, ((List<?>) result.get("stageEvents")).size());
        assertTrue(result.get("files").toString().contains("故事.txt"));
        assertEquals(List.of("小芽"), result.get("inputs"));
        assertEquals("success", python.verifiedMainResult(id, code).status());
        assertThrows(
                BusinessException.class, () -> python.verifiedMainResult(id, "print('另一份代码')"));
    }

    @Test
    void presetsAreIdempotentAndMissingInputReturnsEof() throws Exception {
        String client = UUID.randomUUID().toString();
        var request =
                new NativePythonService.Start(
                        client, "print(input())", null, "preset", List.of("线索"));
        String id = python.start(request).get("id").toString();
        assertEquals(id, python.start(request).get("id"));
        assertThrows(
                BusinessException.class,
                () ->
                        python.start(
                                new NativePythonService.Start(
                                        client, "print(2)", null, "preset", List.of())));
        assertEquals("success", result(await(id, "completed")).get("status"));
        String eof = start("input()", "preset", List.of()).get("id").toString();
        assertTrue(result(await(eof, "completed")).get("error").toString().contains("EOFError"));
    }

    @Test
    void stopKillsChildProcessesAndFreshRunHasNoVariables() throws Exception {
        String code =
                "import subprocess,sys\np=subprocess.Popen([sys.executable,'-c','import time; time.sleep(120)'])\nprint(p.pid,flush=True)\nwhile True: pass";
        String id = start(code, "preset", List.of()).get("id").toString();
        long deadline = System.currentTimeMillis() + 5000;
        String output = "";
        while (output.isBlank() && System.currentTimeMillis() < deadline) {
            output = result(python.snapshot(id)).get("output").toString().trim();
            Thread.sleep(50);
        }
        assertFalse(output.isBlank());
        long child = Long.parseLong(output);
        python.stop(id);
        assertFalse(ProcessHandle.of(child).map(ProcessHandle::isAlive).orElse(false));
        String fresh = start("print('开始')\nprint(name)", "preset", List.of()).get("id").toString();
        assertTrue(result(await(fresh, "completed")).get("error").toString().contains("NameError"));
    }

    @Test
    void selectedVenvUsesItsExistingLibrariesAndSupportsChinesePaths() throws Exception {
        Path environment = data.resolve("中文 虚拟环境");
        Process creator =
                new ProcessBuilder(
                                testExecutable.toString(),
                                "-m",
                                "venv",
                                "--without-pip",
                                environment.toString())
                        .redirectErrorStream(true)
                        .start();
        try {
            assertTrue(creator.waitFor(30, java.util.concurrent.TimeUnit.SECONDS), "测试环境创建超时");
            assertEquals(
                    0,
                    creator.exitValue(),
                    new String(
                            creator.getInputStream().readAllBytes(),
                            java.nio.charset.StandardCharsets.UTF_8));
        } finally {
            if (creator.isAlive()) creator.destroyForcibly();
        }
        Path library = environment.resolve("Lib/site-packages/family_fixture.py");
        Files.writeString(library, "message='来自这个环境的已有库'", java.nio.charset.StandardCharsets.UTF_8);
        environments.select(environment.resolve("Scripts/python.exe").toString());
        String id =
                start("import family_fixture\nprint(family_fixture.message)", "preset", List.of())
                        .get("id")
                        .toString();
        assertTrue(result(await(id, "completed")).get("output").toString().contains("来自这个环境的已有库"));
    }

    @Test
    void timeLimitAccountRevocationAndOversizedFilesAreExplicit() throws Exception {
        String infinite = start("while True: pass", "preset", List.of()).get("id").toString();
        assertEquals("timeout", result(await(infinite, "completed")).get("status"));
        String large =
                start(
                                "open('大文件.txt','w',encoding='utf-8').write('a'*70000)\nprint('写完')",
                                "preset",
                                List.of())
                        .get("id")
                        .toString();
        var largeResult = await(large, "completed");
        assertTrue(largeResult.get("notice").toString().contains("64 KiB"));
        assertFalse(
                ((List<Map<String, String>>) result(largeResult).get("files"))
                        .stream().anyMatch(file -> file.get("name").equals("大文件.txt")));
        AccountScope.set(second);
        String waiting = start("input('等待：')", "live", List.of()).get("id").toString();
        await(waiting, "waiting");
        accounts.saveUser(
                second,
                new AccountRequests.SaveUser("learner", "孩子", "", false, List.of("learner")));
        assertEquals("stopped", result(await(waiting, "completed")).get("status"));
    }

    @Test
    void storeAliasAndMissingInterpreterAreRejected() {
        assertThrows(
                BusinessException.class,
                () ->
                        environments.probe(
                                "C:/Users/user/AppData/Local/Microsoft/WindowsApps/python.exe"));
        assertThrows(
                BusinessException.class,
                () -> environments.select(data.resolve("missing.exe").toString()));
    }

    private Map<String, Object> start(String code, String mode, List<String> inputs) {
        return python.start(
                new NativePythonService.Start(
                        UUID.randomUUID().toString(), code, null, mode, inputs));
    }

    private Map<String, Object> await(String id, String state) throws Exception {
        long deadline = System.currentTimeMillis() + 15000;
        Map<String, Object> value;
        do {
            value = python.snapshot(id);
            if (value.get("state").equals(state)) return value;
            Thread.sleep(50);
        } while (System.currentTimeMillis() < deadline);
        throw new AssertionError("没有到达" + state + ": " + value);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> result(Map<String, Object> value) {
        return (Map<String, Object>) value.get("result");
    }
}
