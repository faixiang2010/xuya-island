package com.xuya.island.execution;

import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.Structure;
import com.sun.jna.platform.win32.BaseTSD.SIZE_T;
import com.sun.jna.platform.win32.BaseTSD.ULONG_PTR;
import com.sun.jna.platform.win32.WinNT.HANDLE;
import com.sun.jna.win32.StdCallLibrary;
import java.util.List;

/** Windows Job限定内存且关闭时回收子进程；用户代码在成功绑定后才收到启动指令。 */
public final class WindowsPythonJob implements AutoCloseable {
    private interface Kernel extends StdCallLibrary {
        Kernel INSTANCE =
                Native.load(
                        "kernel32",
                        Kernel.class,
                        java.util.Map.of(
                                com.sun.jna.Library.OPTION_FUNCTION_MAPPER,
                                (com.sun.jna.FunctionMapper)
                                        (library, method) ->
                                                Character.toUpperCase(method.getName().charAt(0))
                                                        + method.getName().substring(1)));

        HANDLE createJobObjectW(Pointer attributes, Pointer name);

        boolean setInformationJobObject(HANDLE job, int type, Pointer information, int length);

        HANDLE openProcess(int access, boolean inherit, int pid);

        boolean assignProcessToJobObject(HANDLE job, HANDLE process);

        boolean closeHandle(HANDLE handle);
    }

    public static class Basic extends Structure {
        public long processTime;
        public long jobTime;
        public int flags;
        public SIZE_T minimum = new SIZE_T();
        public SIZE_T maximum = new SIZE_T();
        public int active;
        public ULONG_PTR affinity = new ULONG_PTR();
        public int priority;
        public int scheduling;

        @Override
        protected List<String> getFieldOrder() {
            return List.of(
                    "processTime",
                    "jobTime",
                    "flags",
                    "minimum",
                    "maximum",
                    "active",
                    "affinity",
                    "priority",
                    "scheduling");
        }
    }

    public static class Limits extends Structure {
        public Basic basic = new Basic();
        public long[] io = new long[6];
        public SIZE_T processMemory = new SIZE_T(512L * 1024 * 1024);
        public SIZE_T jobMemory = new SIZE_T(512L * 1024 * 1024);
        public SIZE_T peakProcess = new SIZE_T();
        public SIZE_T peakJob = new SIZE_T();

        @Override
        protected List<String> getFieldOrder() {
            return List.of("basic", "io", "processMemory", "jobMemory", "peakProcess", "peakJob");
        }
    }

    private HANDLE handle;

    public WindowsPythonJob(Process process) {
        if (!System.getProperty("os.name").startsWith("Windows")) return;
        Kernel kernel = Kernel.INSTANCE;
        handle = kernel.createJobObjectW(null, null);
        if (handle == null) throw new IllegalStateException("无法创建Python进程组");
        var limits = new Limits();
        limits.basic.flags = 0x2000 | 0x100 | 0x200;
        limits.write();
        HANDLE child = kernel.openProcess(0x100 | 0x1, false, Math.toIntExact(process.pid()));
        try {
            if (!kernel.setInformationJobObject(handle, 9, limits.getPointer(), limits.size())
                    || child == null
                    || !kernel.assignProcessToJobObject(handle, child)) {
                close();
                process.destroyForcibly();
                throw new IllegalStateException("无法绑定Python进程组，请检查系统运行权限");
            }
        } finally {
            if (child != null) kernel.closeHandle(child);
        }
    }

    @Override
    public synchronized void close() {
        if (handle != null) {
            Kernel.INSTANCE.closeHandle(handle);
            handle = null;
        }
    }
}
