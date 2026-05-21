"""
任务状态查询路由模块。
提供 Celery 异步任务的状态查询和结果获取 API。
路由前缀：/api/tasks，标签：tasks。
"""

from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException

from tasks.celery_app import celery_app

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/{task_id}")
async def get_task_status(task_id: str):
    """
    查询 Celery 任务的状态与结果。

    参数：
        task_id: Celery 任务 ID

    返回：
        {
            "task_id": str,
            "status": "PENDING" | "STARTED" | "SUCCESS" | "FAILURE" | "RETRY",
            "result": any (仅 SUCCESS 时有值),
            "error": str | None (仅 FAILURE 时有值)
        }
    """
    result = AsyncResult(task_id, app=celery_app)
    response = {
        "task_id": task_id,
        "status": result.status,
        "result": None,
        "error": None,
    }

    if result.successful():
        response["result"] = result.result
    elif result.failed():
        response["error"] = str(result.info) if result.info else "未知错误"

    return response
