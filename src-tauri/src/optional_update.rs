use serde::{Deserialize, Deserializer};

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) enum OptionalUpdate<T> {
    #[default]
    Unset,
    Set(Option<T>),
}

impl<'de, T> Deserialize<'de> for OptionalUpdate<T>
where
    T: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Option::<T>::deserialize(deserializer).map(Self::Set)
    }
}

impl<T> OptionalUpdate<T> {
    pub(crate) fn is_set(&self) -> bool {
        matches!(self, Self::Set(_))
    }

    pub(crate) fn as_update(&self) -> Option<Option<&T>> {
        match self {
            Self::Unset => None,
            Self::Set(value) => Some(value.as_ref()),
        }
    }
}
