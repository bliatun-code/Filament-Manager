pub(crate) async fn run_bounded_blocking_polls<T, F>(
    entries: Vec<T>,
    concurrency_limit: usize,
    shutdown: tokio::sync::watch::Receiver<bool>,
    poll: F,
) -> Vec<String>
where
    T: Send + 'static,
    F: Fn(T) -> Result<(), String> + Clone + Send + 'static,
{
    let mut pending = entries.into_iter();
    let mut polls = tokio::task::JoinSet::new();
    let concurrency_limit = concurrency_limit.max(1);

    for _ in 0..concurrency_limit {
        if *shutdown.borrow() {
            break;
        }
        let Some(entry) = pending.next() else {
            break;
        };
        let poll_task = poll.clone();
        drop(polls.spawn_blocking(move || poll_task(entry)));
    }

    let mut errors = Vec::new();
    loop {
        let next_result = polls.join_next().await;
        let Some(result) = next_result else {
            break;
        };
        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => errors.push(error),
            Err(join_error) => errors.push(format!("poll task failed: {join_error}")),
        }
        let next_entry = if *shutdown.borrow() {
            None
        } else {
            pending.next()
        };
        if let Some(entry) = next_entry {
            let poll_task = poll.clone();
            drop(polls.spawn_blocking(move || poll_task(entry)));
        }
    }
    errors
}
