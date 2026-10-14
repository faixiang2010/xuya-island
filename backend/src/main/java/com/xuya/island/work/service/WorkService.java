package com.xuya.island.work.service;

import com.xuya.island.work.dto.SaveWorkRequest;
import com.xuya.island.work.vo.WorkVO;
import java.util.List;

/**
 * 作品用例：查询、创建、保存。调用者应在非事件循环线程执行。
 *
 * @author Codex代码助手
 */
public interface WorkService {

    List<WorkVO> list();

    WorkVO get(String id);

    WorkVO create(SaveWorkRequest request);

    WorkVO update(String id, SaveWorkRequest request);
}
